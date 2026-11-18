/* 连续玩多局，检查渲染层状态有没有跨局残留（第 93 轮，第二版）。
 *
 * ── 第一版的问题 ──
 *
 * 第一版在 `launch()` 之后 `sleep(160)` 再快照，于是新局开局那一下
 * **车落地本身**产生的尘土/震屏被算成了"上一局的残留"：
 *
 *   第 2 局启动前  shake 0      dust 10  debris 25
 *   第 2 局启动后  shake 0.165  dust 5   debris 13
 *
 * 显然是新局落地产生的（还带走了几个旧的）。判据量错了对象。
 *
 * ── 第二版的量法 ──
 *
 * 在**同一个 evaluate 里**完成 `launch()` + 快照 —— 中间一帧都不给 rAF，
 * 所以拿到的就是"上一局留下的东西"，不含新局自己的活动。
 *
 * ── 第一版已经暴露的两个真问题 ──
 *
 *   · `shakePeak` / `flashPeak` 从 1.2 / 0.35 一路带到第 3 局 ——
 *     它们是**峰值**，只增不减，跨局存活。
 *   · 粒子数组（dust/debris/bursts/confetti/boxBurst）跨局残留，
 *     下一局开场时上一局撞出来的碎片还在天上飞。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

(async () => {
  const PORT = 9990 + Math.floor(Math.random() * 20);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgeMulti93b-' + Date.now()),
    '--window-size=1280,760', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  const send = (m, p) => new Promise((res, rej) => {
    const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(800);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const errs = [];
  ws.addEventListener('message', e2 => {
    try {
      const m = JSON.parse(e2.data);
      if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text);
    } catch (e) {}
  });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value;
  };
  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  /* 一局的快照 */
  const SNAP = `JSON.stringify({
      shake: +(S.shake||0).toFixed(3),
      flash: +(S.flash||0).toFixed(3),
      vignette: +(S.vignette||0).toFixed(3),
      slowmo: +(S.slowmo||0).toFixed(3),
      shakePeak: +(S.shakePeak||0).toFixed(3),
      flashPeak: +(S.flashPeak||0).toFixed(3),
      dust: (S.dust||[]).length,
      debris: (S.debris||[]).length,
      bursts: (S.bursts||[]).length,
      confetti: (S.confetti||[]).length,
      boxBurst: (S.boxBurst||[]).length,
      boxPop: S.boxPop ? 1 : 0,
      boxPulse: +(S.boxPulse||0).toFixed(3),
      fireworkFlash: +(S.fireworkFlash||0).toFixed(3),
      hintTier: S.hintTier,
      hintOpen: S.hintOpen ? 1 : 0,
      resultT: +(S.resultT||0).toFixed(3),
      outroT: +(S.outroT||0).toFixed(3),
      lastEventLen: S.lastEventLen||0,
      lastBreakSfx: S.lastBreakSfx===undefined?null:+S.lastBreakSfx.toFixed(2)
    })`;

  /* 「启动前」：startLevel 之后、launch 之前 */
  async function snapshotBeforeLaunch(levelIndex) {
    return JSON.parse(await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(${levelIndex}); S.welcome=0; S.introT=1;
      return ${SNAP};})()`));
  }
  /* 「启动后」：**同一个 evaluate 里** launch + 快照 —— 不给 rAF 任何一帧，
   * 所以拿到的只有"上一局留下的"，不含新局落地产生的尘土。 */
  async function launchAndSnapshot(levelIndex) {
    return JSON.parse(await ev(`(()=>{const R=window.__rap, S=R.state, lv=R.levels[${levelIndex}];
      R.RAP.applySpec(lv, S.build, R.RAP.SPECS['1-1']);
      R.launch(); S.runBanner=0;
      return ${SNAP};})()`));
  }

  /* 玩一局：8 米落体撞出碎片与峰值，再推到结算页 */
  async function playOne(h, levelIndex) {
    await ev(`(()=>{const R=window.__rap, S=R.state, lv=R.levels[${levelIndex}];
      S.welcome=0; S.helpOpen=0; S.paused=false;
      R.startLevel(${levelIndex}); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
      R.RAP.applySpec(lv, S.build, R.RAP.SPECS['1-1']);
      R.launch(); S.runBanner=0;
      S.run.car.y += ${h}; S.run.spawnGrace = 0;
      return 1;})()`);
    await sleep(1500);
    await ev(`(()=>{const S=window.__rap.state;
      S.phase='resolved'; S.resultT=0.5; S.outroT=0.5; return 1;})()`);
    await sleep(300);
    return JSON.parse(await ev(`(()=>{const S=window.__rap.state;
      return JSON.stringify({ shakePeak: +(S.shakePeak||0).toFixed(2),
        flashPeak: +(S.flashPeak||0).toFixed(2),
        dust: (S.dust||[]).length, debris: (S.debris||[]).length });})()`));
  }

  console.log('=== 连续玩三局（快照在 launch 的同一个 evaluate 里，不含新局活动）===');
  const starts = [];
  for (let n = 0; n < 3; n++) {
    const lvIdx = n === 0 ? 0 : (n === 1 ? 2 : 4);
    const end = await playOne(8, lvIdx);
    console.log('第 ' + (n + 1) + ' 局结束时：' + JSON.stringify(end));
    const nextIdx = (lvIdx + 1) % 8;
    const before = await snapshotBeforeLaunch(nextIdx);
    const after = await launchAndSnapshot(nextIdx);
    if (n > 0) {
      console.log('第 ' + (n + 1) + ' 局启动后（残留）：' + JSON.stringify(after));
      starts.push({ n: n + 1, before, after });
    } else {
      console.log('（第一局的启动后状态作为对照，不参与判据）');
      starts.push({ n: n + 1, before, after, baseline: true });
    }
    /* 清理，让下一轮从"刚启动"开始 */
    await ev(`(()=>{window.__rap.state.phase='build'; window.__rap.state.run=null; return 1;})()`);
    await sleep(80);
  }

  console.log('');
  console.log('=== 判据（第 2、3 局启动后的残留）===');

  starts.filter(s => !s.baseline).forEach(({ n, after: a }) => {
    const tag = '第 ' + n + ' 局';
    chk('A ' + tag + ' 启动后 shake/flash/vignette/slowmo 全为 0',
      a.shake === 0 && a.flash === 0 && a.vignette === 0 && a.slowmo === 0,
      'shake ' + a.shake + ' flash ' + a.flash + ' vig ' + a.vignette +
      ' slowmo ' + a.slowmo);

    const particles = a.dust + a.debris + a.bursts + a.confetti + a.boxBurst;
    chk('B ' + tag + ' 启动后粒子数组全空（上一局的碎片不能飞到新局）',
      particles === 0,
      'dust ' + a.dust + ' debris ' + a.debris + ' bursts ' + a.bursts +
      ' confetti ' + a.confetti + ' boxBurst ' + a.boxBurst);

    chk('C ' + tag + ' 启动后峰值字段归零',
      a.shakePeak === 0 && a.flashPeak === 0,
      'shakePeak ' + a.shakePeak + ' flashPeak ' + a.flashPeak);

    chk('D ' + tag + ' 启动后 boxPop / boxPulse 已清空',
      a.boxPop === 0 && a.boxPulse === 0,
      'boxPop ' + a.boxPop + ' boxPulse ' + a.boxPulse);

    chk('E ' + tag + ' 启动后 hintTier = 0 且 hintOpen = false',
      a.hintTier === 0 && a.hintOpen === 0,
      'tier ' + a.hintTier + ' open ' + a.hintOpen);

    chk('F ' + tag + ' 启动后 resultT / outroT = 0',
      a.resultT === 0 && a.outroT === 0,
      'resultT ' + a.resultT + ' outroT ' + a.outroT);

    chk('G ' + tag + ' 启动后事件游标归零',
      a.lastEventLen === 0 && a.lastBreakSfx === -9,
      'lastEventLen ' + a.lastEventLen + ' lastBreakSfx ' + a.lastBreakSfx);
  });

  console.log('');
  console.log(lines.join('\n'));
  console.log('');
  console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  try { ws.close(); } catch (e) {}
  try { require('./lib/asserts.js').killTree(child); } catch (e) {}
  process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

/* 跨局的事件游标必须归零（第 92 轮）。
 *
 * ── 这个 bug 是怎么被发现的 ──
 *
 * 第 92 轮把事件消费抽成 `consumeRunEvents()` 之后，
 * `test_break_sfx` 变红了：它连续跑两局（2 米、8 米落体），
 * 第二局的 `part_broken` 一条都没被消费，`structBreak` 一声都没响。
 *
 * 根因：`state.run.events` 是每局新建的数组，而 `state.lastEventLen`
 * 是**渲染层**的游标，跨局存活。上一局结束时它是 9，新局事件从 0 开始 ——
 * 消费循环从 index 9 起，**前 9 条事件永远不会被演出来**。
 *
 * 它单独跑是绿的（游标从 0 起），只有"连续两局"才暴露。
 *
 * ── 判据 ──
 *
 *   A `launch()` 之后 `lastEventLen` 必须是 0
 *   B 连续两局，第二局的事件必须被完整消费（每一条都有一个可观测后果）
 *   C `lastBreakSfx` 也归零（否则新局开局 0.25 秒内的碎框被当成重复）
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
  const PORT = 9970 + Math.floor(Math.random() * 30);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgeCur92-' + Date.now()),
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

  async function runOnce(h) {
    await ev(`(()=>{const s=window.__rap.state,R=window.__rap,lv=window.__rap.levels[0];
      s.welcome=0; s.helpOpen=0; s.paused=false;
      R.startLevel(0); s.welcome=0; s.introT=1;
      R.RAP.applySpec(lv, s.build, R.RAP.SPECS['1-1']);
      R.launch(); s.runBanner=0;
      s.run.car.y += ${h}; s.run.spawnGrace = 0;
      window.__rap.clearFxLog();
      return 1;})()`);
    await sleep(2600);
    return JSON.parse(await ev(`(()=>{const s=window.__rap.state;
      const evs = (s.run && s.run.events) || [];
      return JSON.stringify({ fx: window.__rap.fxLog(),
        breaks: evs.filter(e=>e.indexOf('part_broken')===0).length,
        hurts: evs.filter(e=>e.indexOf('struct_hurt')===0).length,
        lastEventLen: s.lastEventLen||0 });})()`));
  }

  /* A launch 之后游标归零 */
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap,lv=window.__rap.levels[0];
    R.startLevel(0); s.welcome=0; s.introT=1;
    R.RAP.applySpec(lv, s.build, R.RAP.SPECS['1-1']);
    R.launch();
    return 1;})()`);
  const after = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
    return JSON.stringify({ lastEventLen: s.lastEventLen,
      lastBreakSfx: s.lastBreakSfx });})()`));
  lines.push('launch 之后：lastEventLen=' + after.lastEventLen +
    '  lastBreakSfx=' + after.lastBreakSfx);
  chk('A launch() 之后事件游标归零', after.lastEventLen === 0,
    String(after.lastEventLen));
  chk('A2 launch() 之后碎框音效去重时刻归零', after.lastBreakSfx === -9,
    String(after.lastBreakSfx));

  /* B 连续两局，第二局的事件必须被完整消费 */
  const r1 = await runOnce(2);
  const r2 = await runOnce(8);
  lines.push('第一局（2 米）：碎框 ' + r1.breaks + '，掉耐久 ' + r1.hurts +
    '，音效 [' + r1.fx.join(' ') + ']，末游标 ' + r1.lastEventLen);
  lines.push('第二局（8 米）：碎框 ' + r2.breaks + '，掉耐久 ' + r2.hurts +
    '，音效 [' + r2.fx.join(' ') + ']');
  chk('B 第二局的碎框事件被完整消费（structBreak 响了）',
    r2.breaks > 0 && r2.fx.indexOf('structBreak') >= 0,
    '碎框 ' + r2.breaks + ' / 音效 [' + r2.fx.join(' ') + ']');
  chk('B2 第一局只裂不碎，播 crack 而不是 structBreak',
    r1.fx.indexOf('crack') >= 0 && r1.fx.indexOf('structBreak') < 0,
    '[' + r1.fx.join(' ') + ']');

  console.log('');
  console.log(lines.join('\n'));
  console.log('');
  console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  try { ws.close(); } catch (e) {}
  try { require('./lib/asserts.js').killTree(child); } catch (e) {}
  process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

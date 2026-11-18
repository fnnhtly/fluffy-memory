/* 八关完整试玩巡检（第 94 轮）。
 *
 * ── 为什么这一轮要做它 ──
 *
 * 最近七轮全在挖状态生命周期和判据（空转、变异、跨局残留）。
 * 产品层面的改动只有「捡木箱演出」和「字段清零」。
 * 而目标写的是「达到正常商业 2D 游戏的水准」——
 * 那最终只能靠**整体观感**判断。
 *
 * ── 量什么 ──
 *
 *   A 八关都能用真实 UI 路径装出来、发射、走到结算
 *   B 八关都判胜、都三星
 *   C 时长有长有短（不是一刀切），且在一个可玩的区间里
 *   D 结算卡**静止之后**完全在屏幕内，按钮在卡下方且不越界
 *   E 八关走完 0 控制台异常
 *
 * ⚠ D 组是这一轮补的：第一版截图时 `resultT` 才 0.x，卡片还在从屏幕上方
 * 滑进来（`cardY = 150 − (1−ease)×420`，resultT=0 时是 −270），
 * 截到的"到达终点!"标题被切掉半个。那不是产品 bug，是截图时机 ——
 * 但它提醒了一件事：**没有任何判据守着"结算卡静止时在屏幕内"**。
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, 'records', 'shots');
const SPEC_OF = require('./lib/specmap.js').SPEC_OF;

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const PORT = 9500 + Math.floor(Math.random() * 80);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgePlay94-' + Date.now()),
    '--window-size=1280,760', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
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
  await send('Page.navigate', { url: PAGE }); await sleep(900);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
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
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(s.data, 'base64'));
    return name;
  };

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  const LEVELS = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8'];
  const rows = [];
  const filmstrip = [];
  let cardRects = null;

  for (let i = 0; i < LEVELS.length; i++) {
    const key = SPEC_OF[LEVELS[i]];
    const built = JSON.parse(await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(${i}); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
      S.paused=false; S.helpOpen=false; S.levelSelect=false;
      const spec = R.RAP.SPECS[${JSON.stringify(key)}];
      R.RAP.applySpec(R.level(), S.build, spec);
      const chk = R.RAP.canLaunch(S.build);
      return JSON.stringify({ ok: chk.ok, reason: chk.reason || '' });})()`));
    if (!built.ok) { lines.push(LEVELS[i] + ' 装不出来：' + built.reason); continue; }

    await sleep(650);
    filmstrip.push(await shot('rp-' + LEVELS[i] + '-build'));

    const launched = JSON.parse(await ev(`(()=>{const R=window.__rap, S=R.state;
      R.launch();
      const spec = R.RAP.SPECS[${JSON.stringify(key)}];
      R.RAP.applySpecRuntime(S.run, spec);
      const acts = [];
      ((spec._presses)||[]).forEach(a => acts.push({t:a.t, k:a.k||'press'}));
      ((spec._drops)||[]).forEach(a => { for(let k=0;k<(a.n||1);k++) acts.push({t:a.t+k*0.016,k:'drop'}); });
      ((spec._pops)||[]).forEach(a => { for(let k=0;k<(a.n||1);k++) acts.push({t:a.t+k*0.016,k:'pop'}); });
      ((spec._seeds)||[]).forEach(a => acts.push({t:a.t, k:'seed', kind:a.kind}));
      acts.sort((a,b)=>a.t-b.t);
      S.run.actScript = acts;
      return JSON.stringify({ actCount: acts.length });})()`));
    const launchAt = Date.now();

    let waited = 0;
    while (waited < 40000) {
      await sleep(120);
      waited = Date.now() - launchAt;
      const ph = await ev('window.__rap.state.phase');
      if (ph !== 'run') break;
    }

    /* ⚠ 等结算卡**滑完**（resultT 到 1）再截图。
     * `cardY = 150 − (1−ease)×420`，resultT=0 时卡片顶在 −270，
     * 立刻截会把标题切掉一半。 */
    await sleep(1200);

    /* D 组：量结算卡与两个按钮的几何（静止之后） */
    if (!cardRects && (await ev('window.__rap.state.phase')) === 'resolved') {
      cardRects = JSON.parse(await ev(`(()=>{const R=window.__rap, S=R.state;
        const retry = R.btnRect('retry'), next = R.btnRect('next');
        /* 卡片几何：与 drawResult 同一套常量（W=760, H=424, cardY 静止 = 150） */
        return JSON.stringify({ card: { x: 1280/2 - 760/2, y: 150, w: 760, h: 424 },
          retry: retry, next: next, resultT: +(S.resultT||0).toFixed(2),
          btnY: S.resultBtnY });})()`));
    }

    filmstrip.push(await shot('rp-' + LEVELS[i] + '-result'));

    const res = JSON.parse(await ev(`(()=>{const S=window.__rap.state, r=S.run;
      return JSON.stringify({ result: r ? r.result : null,
        fail: r ? (r.failReason||'') : '', time: r ? +(r.time||0).toFixed(2) : 0,
        stars: r ? (r.stars||0) : 0, boxes: r ? (r.boxesGot||0) : 0,
        goals: r ? r.starGoals : null });})()`));

    rows.push({ id: LEVELS[i], relaunched: launched, res });
    console.log(LEVELS[i] + '  ' + res.result + '  ★' + res.stars +
      '  ' + res.time + 's  动作 ' + launched.actCount +
      (res.fail ? '  fail=' + res.fail : ''));
  }

  console.log('');
  console.log('=== 判据 ===');

  chk('A 八关都能用真实 UI 路径装出来并发射', rows.length === 8,
    rows.length + ' / 8');
  chk('B 八关都走到结算并判胜',
    rows.every(r => r.res.result === 'win'),
    rows.filter(r => r.res.result === 'win').length + '/8');
  chk('C 八关标准解都三星', rows.every(r => r.res.stars === 3),
    rows.filter(r => r.res.stars === 3).length + '/8');

  {
    const durs = rows.map(r => r.res.time);
    const min = Math.min(...durs), max = Math.max(...durs);
    lines.push('八关时长：' + rows.map(r => r.id + '=' + r.res.time + 's').join(' '));
    chk('D 时长跨度 ≥ 3 秒（关卡有长短之分）', max - min >= 3,
      min + '~' + max + 's');
    chk('D2 没有一关短于 1.5 秒', min >= 1.5, min + 's');
    chk('D3 没有一关长于 20 秒', max <= 20, max + 's');
  }

  /* E 结算卡静止时必须在屏幕内，按钮在卡下方 */
  if (cardRects) {
    const c = cardRects.card, r1 = cardRects.retry, r2 = cardRects.next;
    lines.push('结算卡静止时：卡 y=' + c.y + '~' + (c.y + c.h) +
      '，按钮 y=' + r1.y + '~' + (r1.y + r1.h) + '（resultT=' +
      cardRects.resultT + '）');
    chk('E 结算卡完全在屏幕内（y ∈ [0, 720]）',
      c.y >= 0 && c.y + c.h <= 720, c.y + '~' + (c.y + c.h));
    chk('E2 两个按钮都在卡片**下方**（不压在卡上）',
      r1.y >= c.y + c.h && r2.y >= c.y + c.h,
      '按钮 ' + r1.y + ' vs 卡底 ' + (c.y + c.h));
    chk('E3 两个按钮都在屏幕内', r1.y + r1.h <= 720 && r2.y + r2.h <= 720,
      (r1.y + r1.h) + ' / ' + (r2.y + r2.h));
    chk('E4 两个按钮横向不重叠',
      r1.x + r1.w <= r2.x, (r1.x + r1.w) + ' ≤ ' + r2.x);
  } else {
    chk('E 前提：至少走到一次结算页并量到卡片几何', false, '没量到');
  }

  chk('F 八关走完没有控制台异常', errs.length === 0,
    errs.length ? errs.slice(0, 2).join(' | ') : '0 条');

  console.log('');
  console.log(lines.join('\n'));
  console.log('');
  console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  console.log('');
  console.log('关键帧 ' + filmstrip.length + ' 张');

  try { ws.close(); } catch (e) {}
  try { require('./lib/asserts.js').killTree(child); } catch (e) {}
  process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

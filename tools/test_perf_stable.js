/* 帧率守卫：行驶阶段（最重的一屏）必须稳在 55fps 以上。
 *
 * 这一轮把它写成真断言并接进 verify，原因是有过一次实测 14fps 的事故
 * （当时给 Edge 加了 --disable-gpu，走的是软件光栅化，我却以为画崩了）。
 * 不量帧率的话，"加了点特效"这种改动迟早把帧率拖下去而没人知道。
 *
 * 注意：
 *   · 绝对不能加 --disable-gpu（会掉到 14fps，测的不是游戏）；
 *   · 三次各 2.5s 取中位数，避免单次抖动；
 *   · 基线是 58~60。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9430;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeS2-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(900);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  // 行驶一局（最重：地形 + 车 + 粒子 + HUD）
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[2];
    window.__rap.startLevel(2); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-3']);
    window.__rap.launch(); return 1;})()`);
  await sleep(600);

  const measure = async (seconds) => {
    const f0 = await ev('window.__rap.state.frameCount');
    await sleep(seconds * 1000);
    const f1 = await ev('window.__rap.state.frameCount');
    return (f1 - f0) / seconds;
  };

  const runs = [];
  for (let k = 0; k < 3; k++) runs.push(await measure(2.5));
  const sorted = runs.slice().sort((a, b) => a - b);
  const median = sorted[1];
  A.log('三次帧率：' + runs.map(v => v.toFixed(1)).join(' / ') + '，中位数 ' + median.toFixed(1));

  A.chk('行驶阶段帧率 >= 55', median >= 55, median.toFixed(1) + ' fps');
  A.chk('帧率没有明显掉帧（最低一次也 >= 45）', sorted[0] >= 45, sorted[0].toFixed(1) + ' fps');

  // 建造页也要量一次（面板 + 网格 + 全部零件图元）
  await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null; s.introT=1; return 1;})()`);
  await sleep(700);
  const buildFps = await measure(2.0);
  A.log('建造页帧率：' + buildFps.toFixed(1));
  A.chk('建造页帧率 >= 55', buildFps >= 55, buildFps.toFixed(1) + ' fps');

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

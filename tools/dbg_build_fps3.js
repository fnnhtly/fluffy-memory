/* 建造页 fps：新旧代码对照（用同一套协议，量的是"这一版到底掉没掉"）。
 * 旧版没有 buildView，所以指标只用 state.phase + frameCount + camLive。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeP6-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  await send('Runtime.evaluate', { expression: "localStorage.clear();localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1500);
  const ev = async e => { const r = await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
    return r.result.value; };

  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(1200);

  const m = async (label) => ev(`(async()=>{
    const f0=window.__rap.state.frameCount, t0=performance.now();
    await new Promise(r=>setTimeout(r,2000));
    const f1=window.__rap.state.frameCount, dt=(performance.now()-t0)/1000;
    const s=window.__rap.state;
    const z = s.camLive ? +s.camLive.zoom.toFixed(2) : -1;
    return JSON.stringify({label:'${label}', fps:+((f1-f0)/dt).toFixed(1), zoom:z});})()`);

  // 连续量 4 次，看是否收敛
  for (let i = 1; i <= 4; i++) console.log(await m('build#' + i));

  // 切到行驶相再切回来 —— 复现 test_perf_stable 的流程
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[2];
    window.__rap.startLevel(2); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-3']);
    window.__rap.launch(); return 1;})()`);
  await sleep(800);
  console.log(await m('run 1-3'));
  await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null; s.introT=1;
    s.buildView=null; return 1;})()`);
  await sleep(1000);
  console.log(await m('back to build #1'));
  console.log(await m('back to build #2'));

  send('Browser.close'); try { require('child_process')
    .spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

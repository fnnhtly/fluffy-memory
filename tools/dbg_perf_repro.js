/* 复现 test_perf_stable 的建造页测量序列，找出 21 fps 的来源。 */
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeP4-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value; };

  const fps = (label) => ev(`(async()=>{
    let n=0; const t0=performance.now();
    await new Promise(res=>{
      function f(){ n++; if(performance.now()-t0 < 2000) requestAnimationFrame(f); else res(); }
      requestAnimationFrame(f);
    });
    const dt=(performance.now()-t0)/1000;
    const s=window.__rap.state;
    return JSON.stringify({label:'${label}', fps:+(n/dt).toFixed(1),
      phase:s.phase, lv:window.__rap.level().levelId,
      zoom:+(s.buildView?s.buildView.zoom:0).toFixed(2),
      cells: s.build ? Object.keys(s.build.cells).length : -1,
      run: !!s.run, debris:(s.debris||[]).length, dust:(s.dust||[]).length,
      bursts:(s.bursts||[]).length, confetti:(s.confetti||[]).length});})()`);

  // 基线（空转）
  console.log(await fps('idle base'));

  // 完全复现 test_perf_stable：跑 1-3 一局，然后切回 build
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[2];
    window.__rap.startLevel(2); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-3']);
    window.__rap.launch(); return 1;})()`);
  await sleep(700);
  console.log(await fps('running 1-3'));

  await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null; s.introT=1; return 1;})()`);
  await sleep(800);
  console.log(await fps('after phase=build (test 的做法)'));

  // 再干净地 startLevel 一次
  await ev(`(()=>{const s=window.__rap.state; window.__rap.startLevel(2); s.welcome=0; s.introT=1; return 1;})()`);
  await sleep(800);
  console.log(await fps('startLevel(2) 干净进关'));

  send('Browser.close'); try { require('child_process')
    .spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

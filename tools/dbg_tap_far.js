/* 「点车身外面不误触」为什么会把沙袋扔了两次？直接打点。 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const PORT = 9860 + Math.floor(Math.random() * 100);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeTap-' + Date.now()),
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
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  await ev(`(()=>{const R=window.__rap, S=R.state;
    R.startLevel(5); S.welcome=0; S.introT=1;
    R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-6']);
    const st=R.RAP.createRun(R.level(), S.build);
    R.RAP.applySpecRuntime(st, R.RAP.SPECS['1-6']);
    S.run = st; S.phase='run'; S.paused=false;
    return 1;})()`);
  await sleep(600);

  // 打点：包 tapAt，记录每次调用与结果
  await ev(`(()=>{
    window.__tapLog = [];
    const R = window.__rap.RAP;
    const o = R.tapAt;
    R.tapAt = function(st, wx, wy) {
      const r = o.apply(this, arguments);
      window.__tapLog.push({ wx:+wx.toFixed(2), wy:+wy.toFixed(2),
        hit: r ? r.kind : null });
      return r;
    };
    return 1;})()`);

  const st0 = JSON.parse(await ev(`(()=>{const s=window.__rap.state.run;
    return JSON.stringify({bags:s.sandbagsDropped||0, pops:s.balloonPops||0,
      carX:+s.car.x.toFixed(2), carY:+s.car.y.toFixed(2),
      tapPts: s.car.parts.filter(p=>p.def.stack||p.def.oneShot).map(p=>({
        part:p.part, lx:p.lx, ly:p.ly, n:p.n||1 }))});})()`));
  console.log('点之前：', JSON.stringify(st0));

  // 点一个远离的点（屏幕左上角空白）
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();
    return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  const p = cl(120, 200);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(300);

  console.log('tapAt 调用记录：', await ev('JSON.stringify(window.__tapLog)'));
  console.log('点之后：', await ev(`(()=>{const s=window.__rap.state.run;
    return JSON.stringify({bags:s.sandbagsDropped||0, pops:s.balloonPops||0});})()`));

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

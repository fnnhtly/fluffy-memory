/* 在"只翻转视差"的两帧之间，逐行量水平方差 —— 找出山体真正落在哪几行。 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const PORT = 9520 + Math.floor(Math.random() * 120);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeHS-' + Date.now()),
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
  await sleep(350);
  await ev(`(()=>{const S=window.__rap.state; S.buildView.x = window.__rap.level().start.col + 6;
    window.__rap.clampBuildView(S.buildView, window.__rap.level()); return 1;})()`);
  await sleep(360);

  const grab = async () => JSON.parse(await ev(`(()=>{
    const R=window.__rap, S=R.state, lv=R.levels[S.levelIndex];
    const ter=R.RAP.makeTerrain(lv), v=S.buildView, s=32*v.zoom;
    const horizonY = 360 - (ter.surfaceY(v.x) + 2.6 - v.y) * s;
    const cv=document.getElementById('cv'), g=cv.getContext('2d');
    const d = g.getImageData(0,0,cv.width,cv.height).data;
    const W = cv.width, H = cv.height;
    const px = new Array(W*H);
    for (let i=0;i<W*H;i++){
      const j=i*4;
      px[i] = Math.round(0.299*d[j]+0.587*d[j+1]+0.114*d[j+2]);
    }
    return JSON.stringify({W,H,px,horizonY:+horizonY.toFixed(1),
      hillX:+(S.hillShiftX||0).toFixed(2)});
  })()`));

  await ev('window.__rap.state.hillParX = 0');
  await sleep(300);
  const f0 = await grab();
  await ev('window.__rap.state.hillParX = 0.36');
  await sleep(300);
  const f1 = await grab();

  console.log('horizonY =', f0.horizonY, ' hillShift on-off =', (f1.hillX - f0.hillX).toFixed(1));
  console.log(' row   MAD(不同行)  水平方差(on)');
  for (let y = 0; y < f0.H; y += 8) {
    let mad = 0, varr = 0, mean = 0, n = 0;
    for (let x = 0; x < f0.W; x++) {
      const a = f0.px[y * f0.W + x], b = f1.px[y * f1.W + x];
      mad += Math.abs(a - b);
      mean += a; n++;
    }
    mad /= n; mean /= n;
    for (let x = 0; x < f0.W; x++) {
      const a = f0.px[y * f0.W + x];
      varr += (a - mean) * (a - mean);
    }
    varr /= n;
    if (mad > 1 || varr > 200) {
      console.log(String(y).padStart(5), mad.toFixed(2).padStart(10), varr.toFixed(0).padStart(12));
    }
  }

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

/* 打印差分误差曲线，看位移到底在哪。 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const PORT = 9540 + Math.floor(Math.random() * 120);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeEC-' + Date.now()),
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
  await sleep(400);

  const grab = async () => JSON.parse(await ev(`(()=>{
    const R=window.__rap, S=R.state, lv=R.levels[S.levelIndex];
    const ter=R.RAP.makeTerrain(lv), v=S.buildView, s=32*v.zoom;
    const horizonY = 360 - (ter.surfaceY(v.x) + 2.6 - v.y) * s;
    const cv=document.getElementById('cv'), g=cv.getContext('2d');
    const d = g.getImageData(0,0,cv.width,cv.height).data;
    const W = Math.floor(cv.width/4), H = Math.floor(cv.height/4);
    const px = new Array(W*H);
    for (let y=0;y<H;y++) for (let x=0;x<W;x++){
      const i = ((y*4)*cv.width + x*4)*4;
      px[y*W+x] = Math.round(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]);
    }
    return JSON.stringify({W,H,px,horizonY:+horizonY.toFixed(1),hillX:+(S.hillShiftX||0).toFixed(2)});
  })()`));

  await ev('window.__rap.state.hillParX = 0');
  await sleep(320);
  const off = await grab();
  await ev('window.__rap.state.hillParX = 0.36');
  await sleep(320);
  const on = await grab();
  console.log('shift on-off =', (on.hillX - off.hillX).toFixed(1), 'px; horizon', on.horizonY);

  // 行区间：horizonY-24 .. horizonY+44
  const rows = [];
  for (let dy = -24; dy <= 44; dy += 4) {
    const r = Math.round((on.horizonY + dy) / 4);
    if (r > 0 && r < on.H - 1) rows.push(r);
  }
  console.log('rows', rows.length);

  function errAt(s) {
    let sum = 0, n = 0;
    for (const r of rows) {
      for (let x = 0; x < on.W; x++) {
        const j = x + s;
        if (j < 0 || j >= off.W) continue;
        sum += Math.abs(on.px[r * on.W + x] - off.px[r * off.W + j]);
        n++;
      }
    }
    return n ? sum / n : null;
  }
  for (const s of [-30, -22, -10, -5, 0, 5, 10, 15, 20, 22, 25, 30]) {
    console.log('s=' + String(s).padStart(4), errAt(s).toFixed(2));
  }

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

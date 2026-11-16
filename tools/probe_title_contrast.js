/* 「6 × 8」这行字现在对比度只有 1.92 —— 到底是什么盖住了它？直接读数。 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9600 + Math.floor(Math.random() * 150);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeC-' + Date.now()),
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

  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(400);

  const info = JSON.parse(await ev(`(()=>{const R=window.__rap, S=R.state;
    const o=R.buildOrigin(), px=R.buildCellPx();
    const HD = Math.max(20, px*0.55);
    return JSON.stringify({
      o: o, px: px, HD: HD,
      titleBaseline: o.y - HD + 10,
      panelTop: o.y - HD - 8,
      camY: S.buildView.y, zoom: S.buildView.zoom,
      anchor: R.buildAnchorWorld ? R.buildAnchorWorld() : null
    });})()`));
  console.log('geometry', JSON.stringify(info, null, 1));

  // 采样那一行文字的像素
  const probe = JSON.parse(await ev(`(()=>{
    const R=window.__rap; const o=R.buildOrigin(), px=R.buildCellPx();
    const HD=Math.max(20,px*0.55);
    const cv=document.getElementById('cv');
    const v=window.__view;
    const k = cv.width / v.W;          // 设计 -> 设备像素
    const gy = Math.round((o.y - HD + 10 - v.offY) * k);
    const gx0 = Math.round((o.x + px*3 - v.offX) * k);
    const gx1 = Math.round((o.x + px*6 + 2 - v.offX) * k);
    const g = cv.getContext('2d');
    const img = g.getImageData(gx0, Math.max(0,gy-12), Math.max(1,gx1-gx0), 14).data;
    const seen = {};
    let mx = 0, mxC = null;
    for (let i=0;i<img.length;i+=4){
      const r=img[i],gg=img[i+1],b=img[i+2];
      const lum = 0.2126*r+0.7152*gg+0.0722*b;
      if (lum>mx){mx=lum;mxC=[r,gg,b];}
      const key = r+','+gg+','+b;
      seen[key]=(seen[key]||0)+1;
    }
    const top = Object.keys(seen).sort((a,b)=>seen[b]-seen[a]).slice(0,5)
      .map(k=>k+' x'+seen[k]);
    return JSON.stringify({ box:{gx0,gx1,gy}, brightest:mxC, maxLum:+mx.toFixed(1), top });
  })()`));
  console.log('pixels', JSON.stringify(probe, null, 1));

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

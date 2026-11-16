/* 为什么「拼装区」标题的像素只有 90/255 亮？扫一条竖线看谁盖住了它。 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9620 + Math.floor(Math.random() * 120);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeS2-' + Date.now()),
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
  await sleep(500);

  console.log('state:', await ev(`(()=>{const S=window.__rap.state;
    return JSON.stringify({introT:S.introT, phase:S.phase, welcome:S.welcome,
      levelSelect:S.levelSelect, helpOpen:S.helpOpen});})()`));

  // 扫一条竖线：x 固定在"拼装区"标题文字上
  console.log(await ev(`(()=>{
    const R=window.__rap; const o=R.buildOrigin(), px=R.buildCellPx();
    const HD=Math.max(20,px*0.55);
    const cv=document.getElementById('cv'), v=window.__view;
    const k=cv.width/v.W;
    const gx = Math.round((o.x + 10 - v.offX)*k);
    const g=cv.getContext('2d');
    const rows=[];
    for (let dy=110; dy<=200; dy+=4) {
      const gy = Math.round((dy - v.offY)*k);
      const d = g.getImageData(gx, gy, 60, 1).data;
      let mx=0, mc=null;
      for (let i=0;i<d.length;i+=4){
        const l=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
        if(l>mx){mx=l;mc=[d[i],d[i+1],d[i+2]];}
      }
      rows.push(dy+': maxLum '+mx.toFixed(0)+' rgb('+mc.join(',')+')');
    }
    return rows.join('\\n');
  })()`));

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

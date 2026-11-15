/* 直接看两帧的原始灰度，判断"完全一样"是真的一样还是量具坏了。 */
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeP-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  await send('Runtime.evaluate', { expression: "localStorage.clear();localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1000);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await ev(`(()=>{window.__rap.launchSpec(0,'1-1');
    const S=window.__rap.state; S.run.phase='frozen'; S.paused=false;
    S.fx=[]; S.particles=[]; S.replay=null; S.runBanner=0; return 1;})()`);
  await sleep(400);
  console.log('phase=', await ev('window.__rap.state.phase'),
              'runPhase=', await ev('window.__rap.state.run.phase'));

  const put = async wx => { await ev(`(()=>{const S=window.__rap.state,c=S.run.car;
      c.x=${wx}; c.vx=0; c.vy=0; c.y=S.run.terrain.surfaceY(${wx})+1.6; return 1;})()`);
    await sleep(900); };
  const cam = async () => await ev('JSON.stringify(window.__rap.state.camState)');
  const row = async (y0) => await ev(`(()=>{
    const cv=document.getElementById('cv'), g=cv.getContext('2d');
    const k=cv.width/1280;
    const img=g.getImageData(Math.round(200*k),Math.round(${y0}*k),
                             Math.round(60*k),1);
    const a=[]; for(let i=0;i<img.data.length;i+=4)
      a.push(Math.round(0.299*img.data[i]+0.587*img.data[i+1]+0.114*img.data[i+2]));
    return JSON.stringify(a);})()`);

  await put(20); console.log('camA=', await cam());
  const r1 = await row(470); const r2 = await row(560);
  await put(30); console.log('camB=', await cam());
  const r3 = await row(470); const r4 = await row(560);

  console.log('y=470  A:', r1);
  console.log('y=470  B:', r3);
  console.log('y=470  相同?', r1 === r3);
  console.log('y=560  A:', r2);
  console.log('y=560  B:', r4);
  console.log('y=560  相同?', r2 === r4);

  send('Browser.close'); try { require('child_process')
    .spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

/* 精确诊断：把木框画上去，逐格统计"变化像素"，看它落在哪个格子。 */
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeNB3-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1000);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(600);

  /* 一次 evaluate 里做：快照A → 放木框 → 强制重绘 → 快照B → 按格统计。
   * 关键是**自己手动调 frameBody 一次**，不依赖 rAF 的时机。 */
  const out = await ev(`(()=>{
    const R=window.__rap, s=R.state, lv=R.level();
    const cv=document.getElementById('cv'), g=cv.getContext('2d');
    const k=cv.width/1280;

    const grab=()=>{const img=g.getImageData(0,0,cv.width,cv.height);return img.data;};
    const A=grab();

    s.build = R.RAP.newBuild();
    R.RAP.tryPlace(lv, s.build, 'wood_frame', 3, 2);
    s.popped = {};

    // 手动重绘一帧（不靠 rAF）
    if (typeof window.__rapForceFrame === 'function') window.__rapForceFrame();

    return JSON.stringify({note:'first pass'});})()`);

  await sleep(700);

  const res = await ev(`(()=>{
    const R=window.__rap, o=R.buildOrigin(), PX=R.BUILD_PX;
    const cv=document.getElementById('cv'), g=cv.getContext('2d');
    const k=cv.width/1280;

    // 现在画面里已有木框。逐格统计该格内的"暗像素占比"（#0a1016 方块会让整格变暗）
    const stat=(dcx,dcy,rad)=>{
      const img=g.getImageData(Math.round((dcx-rad)*k),Math.round((dcy-rad)*k),
                               Math.round(2*rad*k),Math.round(2*rad*k));
      const d=img.data; let dark=0,n=0,sum=0;
      for(let i=0;i<d.length;i+=4){
        const v=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
        sum+=v; if(v<25)dark++; n++;
      }
      return {mean:+(sum/n).toFixed(1), darkPct:+(100*dark/n).toFixed(1)};
    };
    const cellOf=(c,r)=>({x:o.x+c*PX+PX/2, y:o.y+r*PX+PX/2});

    // 木框在 (r=3,c=2)
    const p=cellOf(2,3);
    const frameCenter = stat(p.x,p.y,8);
    const frameWhole  = stat(p.x,p.y,20);
    // 邻近空格做对照
    const q=cellOf(4,3);
    const emptyCenter = stat(q.x,q.y,8);
    const emptyWhole  = stat(q.x,q.y,20);

    return JSON.stringify({frameCenter,frameWhole,emptyCenter,emptyWhole,origin:o,PX});})()`);

  console.log(JSON.stringify(JSON.parse(res), null, 2));

  send('Browser.close'); try { require('child_process')
    .spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

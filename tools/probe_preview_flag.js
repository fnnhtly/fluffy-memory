/* 一次性调试：预览条终点旗的像素到底在哪、是什么颜色。 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeDB-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl);
  let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value;
  };

  for (const i of [0, 5]) {
    await ev(`(()=>{const R=window.__rap,s=R.state; R.startLevel(${i}); s.welcome=0; s.introT=1; return 1;})()`);
    await sleep(400);
    const out = await ev(`(()=>{
      const cv=document.querySelector('canvas');
      const dpr=cv.width/1280;
      const g=cv.getContext('2d',{willReadFrequently:true});
      const R=window.__rap, lv=R.level(), G=R.buildPreviewGeom(lv);
      const ter=R.RAP.makeTerrain(lv);
      const gx=G.xOf(lv.goal.col), gy=G.yOf(ter.surfaceY(lv.goal.col+0.5));
      const top=Math.max(G.yTop+2, gy-15);
      /* 扫整条，找出所有偏红的像素 */
      const reds=[];
      for(let x=G.R.x;x<=G.R.x+G.R.w;x+=1){
        for(let y=G.R.y;y<=G.R.y+G.R.h;y+=1){
          const d=g.getImageData(Math.round(x*dpr),Math.round(y*dpr),1,1).data;
          if(d[0]>150 && d[1]<110 && d[2]<110){
            if(reds.length<40) reds.push([x,y,d[0],d[1],d[2]]);
            else { reds.total=(reds.total||40)+1; }
          }
        }
      }
      return JSON.stringify({lv:lv.levelId, goal:lv.goal.col, gx, gy, top,
        yTop:G.yTop, yBot:G.yBot, dpr, cvW:cv.width,
        reds, sample: g.getImageData(Math.round(gx*dpr),Math.round((top+3)*dpr),1,1).data.slice(0,4),
        sample2: g.getImageData(Math.round((gx+4)*dpr),Math.round((top+3)*dpr),1,1).data.slice(0,4)});
    })()`);
    console.log(out);
  }
  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
})();

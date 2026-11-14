/* 调试：回放里那辆车周围到底画了什么颜色？ */
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeDBG2-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
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
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  await ev(`(()=>{const s=window.__rap.state;
    window.__rap.startLevel(4);
    s.welcome=0; s.introT=1; s.phase='build';
    s.build.cells={};
    s.build.cells['4,2']={part:'wood_frame',dir:0};
    s.build.cells['4,2'].inner='pig';
    s.build.cells['5,2']={part:'wood_wheel',dir:0};
    s.build.cells['3,1']={part:'balloon',dir:0,n:2};
    s.build.cells['3,3']={part:'balloon',dir:0,n:2};
    s.build.order=['4,2','3,1','3,3','5,2'];
    window.__rap.launch();
    s.run.result='fail'; s.run.failReason='stuck'; s.run.phase='resolved';
    s.phase='resolved';
    s.run.replay=[];
    for(let i=0;i<40;i++) s.run.replay.push({t:i/20,x:3+i*0.12,y:6+Math.sin(i*0.3)*0.4,a:-0.2});
    s.resultT=0;
    return 1;})()`);
  await sleep(700);
  const info = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
    return JSON.stringify({replayT:s.replayT, n:s.run.replay.length,
      parts:s.run.car.parts.map(p=>p.part+'x'+(p.n||1)),
      phase:s.run.phase, result:s.run.result});})()`));
  console.log('状态：', JSON.stringify(info));

  // 车在屏幕上的位置：rcam = {x: f.x+1.0, y: f.y+1.2, zoom:1.9}
  const pos = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
    const frames=s.run.replay, speed=0.45;
    const raw=s.replayT*speed*20, idx=Math.min(frames.length-1, Math.floor(raw)), f=frames[idx];
    const z=32*1.9;
    const sx=640+(f.x-(f.x+1.0))*z, sy=360-(f.y-(f.y+1.2))*z;
    return JSON.stringify({idx, sx, sy, z});})()`));
  console.log('回放车在屏幕：', JSON.stringify(pos));

  const hist = JSON.parse(await ev(`(()=>{const cv=document.getElementById('cv'),g=cv.getContext('2d');
    const cx=Math.round(${pos.sx}), cy=Math.round(${pos.sy});
    const R=180;
    const d=g.getImageData(cx-R, cy-R, R*2, R*2).data;
    const m={};
    for(let i=0;i<d.length;i+=4){
      const k=((d[i]>>4)<<8)|((d[i+1]>>4)<<4)|(d[i+2]>>4);
      m[k]=(m[k]||0)+1;
    }
    const arr=Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,18).map(([k,c])=>{
      const v=+k; return [((v>>8)&15)*17+8, ((v>>4)&15)*17+8, (v&15)*17+8, c];});
    return JSON.stringify(arr);})()`));
  console.log('车附近 18 个颜色桶（r,g,b,像素数）：');
  hist.forEach(h => console.log('  ', h.join('\t')));

  const n = await ev(`(()=>{const cv=document.getElementById('cv'),g=cv.getContext('2d');
    const d=g.getImageData(0,0,cv.width,cv.height).data; let c=0;
    for(let i=0;i<d.length;i+=4){const r=d[i],gg=d[i+1],b=d[i+2];
      if(r>200 && b>gg+10) c++;}
    return c;})()`);
  console.log('全屏"真粉"像素：', n);

  // 再试：把气球颜色临时改成品红，看会不会出现在任意位置
  const before = await ev(`(()=>{const cv=document.getElementById('cv'),g=cv.getContext('2d');
    const d=g.getImageData(0,0,cv.width,cv.height).data; let c=0;
    for(let i=0;i<d.length;i+=4){const r=d[i],gg=d[i+1],b=d[i+2];
      if(r>240 && b>200 && gg<80) c++;}
    return c;})()`);
  await ev(`(()=>{const P=window.__rap.RAP.PARTS; P.balloon.color='#ff00ff'; P.balloon._orig=P.balloon.color; return 1;})()`);
  await sleep(400);
  const after = await ev(`(()=>{const cv=document.getElementById('cv'),g=cv.getContext('2d');
    const d=g.getImageData(0,0,cv.width,cv.height).data; let c=0;
    for(let i=0;i<d.length;i+=4){const r=d[i],gg=d[i+1],b=d[i+2];
      if(r>240 && b>200 && gg<80) c++;}
    return c;})()`);
  console.log('品红像素：改色前', before, '改色后', after);

  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

const fs=require('fs');const path=require('path');const os=require('os');
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9355;const ROOT=path.join(__dirname,'..');
const PAGE='file:///'+path.join(ROOT,'prototype','index.html').replace(/\\/g,'/');
const SHOTS=path.join(ROOT,'records','shots');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const child=spawn(EDGE,['--headless=new','--hide-scrollbars',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edgeP-'+Date.now()),
    '--window-size=1280,800','--force-device-scale-factor=1','--no-first-run',
    '--allow-file-access-from-files','about:blank'],{stdio:'ignore'});
  let wsUrl=null;
  for(let i=0;i<60&&!wsUrl;i++){await sleep(250);
    try{const l=await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r=>r.json());
      const pg=l.find(t=>t.type==='page');if(pg)wsUrl=pg.webSocketDebuggerUrl;}catch(e){}}
  const ws=new WebSocket(wsUrl);let id=0;const pend=new Map();const errs=[];
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);
      m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);}
    else if(m.method==='Runtime.exceptionThrown')errs.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});
    ws.send(JSON.stringify({id:i,method:m,params:p||{}}));});
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:PAGE});await sleep(1200);
  await send('Runtime.evaluate',{expression:"localStorage.setItem('rap-welcomed-v1','1')"});
  await send('Page.navigate',{url:PAGE});await sleep(1000);
  const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true})).result.value;
  const rect=JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl=(dx,dy)=>({x:rect.l+dx*rect.w/1280,y:rect.t+dy*rect.h/720});
  async function shot(n){const r=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(SHOTS,n+'.png'),Buffer.from(r.data,'base64'));}
  async function click(dx,dy){const p=cl(dx,dy);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,button:'none'});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
    await sleep(140);}
  const TRAY=['wood_frame','wood_wheel','iron_wheel','motor','battery','pump','pig','eraser'];
  const tray=n=>({x:(1280-(8*46+7*7))/2+TRAY.indexOf(n)*53+23,y:720-76+23});
  const cell=(r,c)=>({x:(1280/2-138-40)+c*46+23,y:128+r*46+23});

  // 建车（1-1）
  for (const c of [1,2,3]) { await click(tray('wood_frame').x,tray('wood_frame').y); await click(cell(4,c).x,cell(4,c).y); }
  for (const c of [1,3]) { await click(tray('wood_wheel').x,tray('wood_wheel').y); await click(cell(5,c).x,cell(5,c).y); }
  await click(tray('pig').x,tray('pig').y); await click(cell(4,2).x,cell(4,2).y);
  await click(830,320);

  const seen = new Set();
  for (let i=0;i<400;i++){
    await sleep(45);
    const mood = await ev('window.__rap.state.pigMood||"-"');
    const sp = await ev('(window.__rap.state.run?window.__rap.state.run.car.vx:0)');
    if (mood && !seen.has(mood)) { seen.add(mood); await shot('pm-'+mood); console.log('mood:', mood, 'vx=', sp.toFixed(2)); }
    const ph = await ev('window.__rap.state.phase');
    if (ph==='resolved') break;
  }
  console.log('seen moods:', [...seen].join(', '));
  console.log('errors:', errs.length?errs.join(' | '):'(none)');
  ws.close();child.kill();process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1);});

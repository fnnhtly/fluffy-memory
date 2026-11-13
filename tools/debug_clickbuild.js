const fs=require('fs');const path=require('path');const os=require('os');
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9382;const ROOT=path.join(__dirname,'..');
const PAGE='file:///'+path.join(ROOT,'prototype','index.html').replace(/\\/g,'/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const child=spawn(EDGE,['--headless=new','--disable-gpu','--hide-scrollbars',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edgeC-'+Date.now()),
    '--window-size=1280,800','--force-device-scale-factor=1','--no-first-run',
    '--allow-file-access-from-files','about:blank'],{stdio:'ignore'});
  let wsUrl=null;
  for(let i=0;i<60&&!wsUrl;i++){await sleep(250);
    try{const l=await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r=>r.json());
      const pg=l.find(t=>t.type==='page');if(pg)wsUrl=pg.webSocketDebuggerUrl;}catch(e){}}
  const ws=new WebSocket(wsUrl);let id=0;const pend=new Map();
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);
      m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);}};
  const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});
    ws.send(JSON.stringify({id:i,method:m,params:p||{}}));});
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:PAGE});await sleep(800);
  await send('Runtime.evaluate',{expression:"localStorage.setItem('rap-welcomed-v1','1')"});
  await send('Page.navigate',{url:PAGE});await sleep(1000);
  const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true})).result.value;
  const rect=JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl=(dx,dy)=>({x:rect.l+dx*rect.w/1280,y:rect.t+dy*rect.h/720});
  async function click(dx,dy){const p=cl(dx,dy);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,button:'none'});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
    await sleep(150);}
  const TRAY=['wood_frame','wood_wheel','iron_wheel','motor','battery','pump','pig','eraser'];
  const tray=n=>({x:(1280-(8*46+7*7))/2+TRAY.indexOf(n)*53+23,y:720-76+23});
  const cell=(r,c)=>({x:(1280/2-138-40)+c*46+23,y:128+r*46+23});

  // 切 1-2 并点击建车
  await ev('window.__rap.startLevel(1); window.__rap.state.welcome=0;');
  await sleep(300);
  for (const c of [1,2,3]) { await click(tray('wood_frame').x,tray('wood_frame').y); await click(cell(4,c).x,cell(4,c).y); }
  for (const c of [1,3]) { await click(tray('wood_wheel').x,tray('wood_wheel').y); await click(cell(5,c).x,cell(5,c).y); }
  await click(tray('pig').x,tray('pig').y); await click(cell(4,2).x,cell(4,2).y);
  await click(tray('pump').x,tray('pump').y); await click(cell(3,2).x,cell(3,2).y);
  console.log('点击建车 cells:', await ev('JSON.stringify(window.__rap.state.build.cells)'));
  console.log('applySpec cells :', await ev(`(()=>{const R=window.__rap.RAP,lv=window.__rap.levels[1];
    const b=R.newBuild(); R.applySpec(lv,b,R.SPECS['1-2']); return JSON.stringify(b.cells);})()`));
  ws.close();child.kill();process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1);});

const fs=require('fs');const path=require('path');const os=require('os');
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9398;const ROOT=path.join(__dirname,'..');
const PAGE='file:///'+path.join(ROOT,'prototype','index.html').replace(/\\/g,'/');
const SHOTS=path.join(ROOT,'records','shots');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const child=spawn(EDGE,['--headless=new','--hide-scrollbars',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edgeV-'+Date.now()),
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
  await send('Page.navigate',{url:PAGE});await sleep(800);
  await send('Runtime.evaluate',{expression:"localStorage.setItem('rap-welcomed-v1','1')"});
  await send('Page.navigate',{url:PAGE});await sleep(1000);
  const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true})).result.value;
  async function shot(n){const r=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(SHOTS,n+'.png'),Buffer.from(r.data,'base64'));}
  const rect=JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl=(dx,dy)=>({x:rect.l+dx*rect.w/1280,y:rect.t+dy*rect.h/720});

  // 建一个有 2 个打气筒的车
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[1];
    window.__rap.startLevel(1); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-2']);
    R.tryPlace(lv, s.build, 'pump', 3, 3);
    s.selected='wood_frame';          // 先选木框（不该显示箭头）
    s.mouse.x = -999; s.mouse.y = -999;
  })()`);
  await sleep(500); await shot('av-01-not-selected');
  console.log('选中木框时（不应有箭头）已截图');

  await ev("window.__rap.state.selected='pump'; window.__rap.state.mouse.x=-999; window.__rap.state.mouse.y=-999;");
  await sleep(500); await shot('av-02-selected-pump');
  console.log('选中打气筒时（应显示箭头）已截图');

  // 悬停其中一个
  const c = cl((1280/2-138-40) + 2*46 + 23, 128 + 3*46 + 23);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:c.x,y:c.y,button:'none'});
  await sleep(400); await shot('av-03-hover');
  console.log('悬停时（该格高亮箭头 + 方向字）已截图');

  console.log('errors:', errs.length?errs.join(' | '):'(none)');
  ws.close();child.kill();process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1);});

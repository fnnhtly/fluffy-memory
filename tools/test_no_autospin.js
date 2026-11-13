const fs=require('fs');const path=require('path');const os=require('os');
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9395;const ROOT=path.join(__dirname,'..');
const PAGE='file:///'+path.join(ROOT,'prototype','index.html').replace(/\\/g,'/');
const SHOTS=path.join(ROOT,'records','shots');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const child=spawn(EDGE,['--headless=new','--hide-scrollbars',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edgeA-'+Date.now()),
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

  // 切 1-2，用 RAP 直接建一个带打气筒的车
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[1];
    window.__rap.startLevel(1); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-2']); s.selected='pump';
  })()`);
  await sleep(400);
  const d0 = await ev("window.__rap.state.build.cells['3,2'].dir");
  // 悬停在打气筒格子上，按住 1.2 秒
  const c = cl((1280/2-138-40) + 2*46 + 23, 128 + 3*46 + 23);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:c.x,y:c.y,button:'none'});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:c.x,y:c.y,button:'left',clickCount:1});
  const dirs = [];
  for (let i=0;i<12;i++){ await sleep(100); dirs.push(await ev("window.__rap.state.build.cells['3,2'].dir")); }
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:c.x,y:c.y,button:'left',clickCount:1});
  await sleep(200);
  const d1 = await ev("window.__rap.state.build.cells['3,2'].dir");
  await shot('ns-01-no-spin');

  const allSame = dirs.every(d => d === d0);
  console.log('按下前 dir =', d0);
  console.log('按住期间采样 =', dirs.join(','));
  console.log('松开后 dir =', d1);
  console.log(allSame ? 'PASS：按住期间不会自己旋转（松手才转一次，符合点一下转一下）' : 'FAIL：按住期间方向变了');
  // 再验证单击一次仍然能转
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:c.x,y:c.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:c.x,y:c.y,button:'left',clickCount:1});
  await sleep(250);
  const d2 = await ev("window.__rap.state.build.cells['3,2'].dir");
  console.log('单击后 dir =', d2, d2 !== d0 ? '（单击仍能转 ✓）' : '（单击失效 ✗）');
  console.log('errors:', errs.length?errs.join(' | '):'(none)');
  ws.close();child.kill();process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1);});

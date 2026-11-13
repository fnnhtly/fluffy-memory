"""验证欢迎引导（3 页 + 跳过 + 只显示一次）。"""
import pathlib

p = pathlib.Path("tools/test_welcome.js")
p.write_text(r"""const fs=require('fs');const path=require('path');const os=require('os');
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9365;const ROOT=path.join(__dirname,'..');
const PAGE='file:///'+path.join(ROOT,'prototype','index.html').replace(/\\/g,'/');
const SHOTS=path.join(ROOT,'records','shots');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const child=spawn(EDGE,['--headless=new','--disable-gpu','--hide-scrollbars',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edgeW-'+Date.now()),
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
  await send('Runtime.evaluate',{expression:"localStorage.clear()"});
  await send('Page.navigate',{url:PAGE});await sleep(1300);
  const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true})).result.value;
  const rect=JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl=(dx,dy)=>({x:rect.l+dx*rect.w/1280,y:rect.t+dy*rect.h/720});
  async function shot(n){const r=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(SHOTS,n+'.png'),Buffer.from(r.data,'base64'));}
  async function click(dx,dy){const p=cl(dx,dy);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,button:'none'});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
    await sleep(180);}
  const out=[];
  out.push('首次进入 welcome = ' + await ev('window.__rap.state.welcome'));
  await shot('wc-01-page1');
  const nextBtn = { x: 1280/2 + 120 + 90, y: 508 + 28 };
  await click(nextBtn.x, nextBtn.y);
  out.push('点下一步 → welcome = ' + await ev('window.__rap.state.welcome'));
  await shot('wc-02-page2');
  await click(nextBtn.x, nextBtn.y);
  out.push('再下一步 → welcome = ' + await ev('window.__rap.state.welcome'));
  await shot('wc-03-page3');
  await click(nextBtn.x, nextBtn.y);
  out.push('最后一步 → welcome = ' + await ev('window.__rap.state.welcome'));
  out.push('localStorage 已标记 = ' + await ev("localStorage.getItem('rap-welcomed-v1')"));
  await shot('wc-04-closed');
  // 刷新后不应再出现
  await send('Page.navigate',{url:PAGE});await sleep(1300);
  out.push('刷新后 welcome = ' + await ev('window.__rap.state.welcome'));
  console.log(out.join('\n'));
  console.log('errors:', errs.length?errs.join(' | '):'(none)');
  ws.close();child.kill();process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1);});
""", encoding="utf-8")
print("written")

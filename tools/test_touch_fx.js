const fs=require('fs');const path=require('path');const os=require('os');
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9420;const ROOT=path.join(__dirname,'..');
const PAGE='file:///'+path.join(ROOT,'prototype','index.html').replace(/\\/g,'/');
const SHOTS=path.join(ROOT,'records','shots');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const child=spawn(EDGE,['--headless=new','--hide-scrollbars',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edgeT2-'+Date.now()),
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

  // 1-2 接触最频繁（439 帧）
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[1];
    window.__rap.startLevel(1); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-2']);
    window.__rap.launch();
  })()`);

  let maxDust = 0, maxShake = 0, shots = 0;
  for (let i=0;i<90;i++){
    await sleep(100);
    const d = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
      return JSON.stringify({dust:(s.dust||[]).length, shake:+(s.shake||0).toFixed(2)});})()`));
    if (d.dust > maxDust) maxDust = d.dust;
    if (d.shake > maxShake) maxShake = d.shake;
    if (d.dust >= 3 && shots < 2) { await shot('tf-0' + (shots+1) + '-dust'); shots++; }
    const ph = await ev('window.__rap.state.phase');
    if (ph === 'resolved') break;
  }
  const touchEvs = await ev(`JSON.stringify((window.__rap.state.run&&window.__rap.state.run.events||[])
    .filter(e=>e.indexOf('touch lvl=')===0).slice(0,20))`);
  const evs = JSON.parse(touchEvs);
  const lvls = evs.map(e => parseInt(e.split('lvl=')[1], 10));
  const counts = {};
  lvls.forEach(l => counts[l] = (counts[l]||0)+1);
  console.log('touch 事件数:', evs.length, '| 级别分布:', JSON.stringify(counts));
  console.log('尘土峰值:', maxDust, '个 | 震屏峰值:', maxShake);
  console.log('拍到尘土帧:', shots);
  console.log('errors:', errs.length?errs.join(' | '):'(none)');
  ws.close();child.kill();process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1);});

const fs=require('fs');const path=require('path');const os=require('os');
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9425;const ROOT=path.join(__dirname,'..');
const PAGE='file:///'+path.join(ROOT,'prototype','index.html').replace(/\\/g,'/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const child=spawn(EDGE,['--headless=new','--hide-scrollbars',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edgeP2-'+Date.now()),
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
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true});
    return r.result && r.result.value;};

  // 装一个帧率计数器
  await ev(`(()=>{ window.__frames=0; window.__lastT=performance.now();
    const orig = window.requestAnimationFrame;
    window.requestAnimationFrame = function(cb){ return orig(function(t){ window.__frames++;
      window.__lastT = t; return cb(t); }); };
  })()`);

  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[1];
    window.__rap.startLevel(1); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-2']);
    window.__rap.launch();
  })()`);

  // 采样 6 秒帧率
  const f0 = await ev('window.__frames');
  await sleep(6000);
  const f1 = await ev('window.__frames');
  const fps = (f1 - f0) / 6;

  const mem = await ev(`(()=>{ const s=window.__rap.state; const r=s.run;
    return JSON.stringify({
      events: r ? r.events.length : 0,
      replay: r ? r.replay.length : 0,
      dust: (s.dust||[]).length,
      debris: (s.debris||[]).length,
      confetti: (s.confetti||[]).length,
      loose: r ? (r.loose||[]).length : 0,
      parts: r ? r.car.parts.length : 0,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize/1048576).toFixed(1) : -1
    });})()`);
  console.log('帧率 ≈', fps.toFixed(1), 'fps');
  console.log('数组/内存:', mem);
  console.log('errors:', errs.length?errs.join(' | '):'(none)');
  ws.close();child.kill();process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1);});

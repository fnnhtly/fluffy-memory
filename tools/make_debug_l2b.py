"""对比：浏览器实时循环 vs 逻辑层 simulate，在 1-2 上的差异。"""
import pathlib

p = pathlib.Path("tools/debug_l2b.js")
p.write_text(r"""const fs=require('fs');const path=require('path');const os=require('os');
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9380;const ROOT=path.join(__dirname,'..');
const PAGE='file:///'+path.join(ROOT,'prototype','index.html').replace(/\\/g,'/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const child=spawn(EDGE,['--headless=new','--disable-gpu','--hide-scrollbars',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edgeD-'+Date.now()),
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

  // 用 RAP 直接建车并 createRun，然后手动 step（完全绕过渲染循环）
  const r = await ev(`(()=>{
    const R = window.__rap.RAP, lv = window.__rap.levels[1];
    const b = R.newBuild();
    R.applySpec(lv, b, R.SPECS['1-2']);
    const st = R.createRun(lv, b);
    let n = 0;
    while (st.phase === 'run' && n < 60*30) { R.step(st, 1/60); n++; }
    return JSON.stringify({result: st.result || st.failReason, x: +st.car.x.toFixed(2), t: +st.time.toFixed(2),
      hp: st.car.parts.filter(p=>p.def.structure).map(p=>p.hp).join('/')});
  })()`);
  console.log('纯 step（无渲染）:', r);

  // 现在走真实循环：startLevel → 触发 launch → 等 10 秒
  await ev(`(()=>{const s=window.__rap.state, R=window.__rap.RAP, lv=window.__rap.levels[1];
    window.__rap.startLevel(1); s.welcome=0; s.levelSelect=false;
    R.applySpec(lv, s.build, R.SPECS['1-2']);
  })()`);
  await sleep(300);
  await ev('window.__rap.launch()');
  for (let i=0;i<4;i++){
    await sleep(2500);
    const info = await ev(`(()=>{const r=window.__rap.state.run; if(!r) return 'none';
      return JSON.stringify({ph:r.phase, t:+r.time.toFixed(2), x:+r.car.x.toFixed(2),
        hp:r.car.parts.filter(p=>p.def.structure).map(p=>p.hp).join('/')});})()`);
    console.log('实时循环 t=' + ((i+1)*2.5) + 's:', info);
  }
  console.log('errors:', errs.length?errs.join(' | '):'(none)');
  ws.close();child.kill();process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1);});
""", encoding="utf-8")
print("written")

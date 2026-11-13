const fs=require('fs');const path=require('path');const os=require('os');
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9436;const ROOT=path.join(__dirname,'..');
const PAGE='file:///'+path.join(ROOT,'prototype','index.html').replace(/\\/g,'/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function run(label, extraArgs) {
  const child=spawn(EDGE,['--headless=new','--hide-scrollbars',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edgeRB-'+Date.now()+Math.random()),
    '--window-size=1280,800','--force-device-scale-factor=1','--no-first-run',
    '--allow-file-access-from-files', ...extraArgs, 'about:blank'],{stdio:'ignore'});
  let wsUrl=null;
  for(let i=0;i<60&&!wsUrl;i++){await sleep(250);
    try{const l=await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r=>r.json());
      const pg=l.find(t=>t.type==='page');if(pg)wsUrl=pg.webSocketDebuggerUrl;}catch(e){}}
  if (!wsUrl) { child.kill(); return null; }
  const ws=new WebSocket(wsUrl);let id=0;const pend=new Map();
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);
      m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);}};
  const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});
    ws.send(JSON.stringify({id:i,method:m,params:p||{}}));});
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:PAGE});await sleep(900);
  await send('Runtime.evaluate',{expression:"localStorage.setItem('rap-welcomed-v1','1')"});
  await send('Page.navigate',{url:PAGE});await sleep(1200);
  await send('Runtime.evaluate',{expression:`
    window.__f=0; const o=window.requestAnimationFrame;
    window.requestAnimationFrame=function(cb){return o(function(t){window.__f++;return cb(t);});};
  `});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true});
    return r.result && r.result.value;};
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[1];
    window.__rap.startLevel(1); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-2']);
    window.__rap.launch();
  })()`);
  await sleep(400);
  const f0 = await ev('window.__f');
  await sleep(2500);
  const f1 = await ev('window.__f');
  const fps = (f1-f0)/2.5;

  // 单独测一次 drawWorld 的 CPU 时间（不停 rAF）
  const cpu = await ev(`(()=>{
    const t0=performance.now();
    for (let i=0;i<10;i++){
      const cv=document.getElementById('cv');
      // 强制走一遍绘制（模拟）
    }
    return +(performance.now()-t0).toFixed(1);
  })()`);
  ws.close(); child.kill();
  return { label, fps: +fps.toFixed(1) };
}

(async()=>{
  const results = [];
  results.push(await run('默认 headless', ['--disable-gpu']));
  await sleep(500);
  results.push(await run('headless + swiftshader', ['--use-gl=swiftshader']));
  await sleep(500);
  results.push(await run('headless + 无 GPU 禁用', []));
  for (const r of results) if (r) console.log(r.label.padEnd(26), r.fps, 'fps');
  process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1);});

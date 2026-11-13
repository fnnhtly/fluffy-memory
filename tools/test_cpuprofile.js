const fs=require('fs');const path=require('path');const os=require('os');
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9434;const ROOT=path.join(__dirname,'..');
const PAGE='file:///'+path.join(ROOT,'prototype','index.html').replace(/\\/g,'/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const child=spawn(EDGE,['--headless=new','--hide-scrollbars',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edgeCP-'+Date.now()),
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
  await send('Page.navigate',{url:PAGE});await sleep(900);
  await send('Runtime.evaluate',{expression:"localStorage.setItem('rap-welcomed-v1','1')"});
  await send('Page.navigate',{url:PAGE});await sleep(1200);
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true});
    return r.result && r.result.value;};

  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[1];
    window.__rap.startLevel(1); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-2']);
    window.__rap.launch();
  })()`);
  await sleep(500);

  await send('Profiler.enable');
  await send('Profiler.setSamplingInterval',{interval:200});
  await send('Profiler.start');
  await sleep(3000);
  const {profile} = await send('Profiler.stop');

  // 统计 self time
  const nodes = new Map();
  profile.nodes.forEach(n => nodes.set(n.id, n));
  const selfCount = new Map();
  for (const id of profile.samples || []) {
    selfCount.set(id, (selfCount.get(id)||0)+1);
  }
  const total = (profile.samples||[]).length || 1;
  const rows = [];
  for (const [id, cnt] of selfCount) {
    const n = nodes.get(id);
    if (!n) continue;
    const cf = n.callFrame;
    rows.push({ fn: cf.functionName || '(anonymous)', url: (cf.url||'').split('/').pop(),
      pct: cnt / total * 100, ms: cnt * 0.2 });
  }
  rows.sort((a,b)=>b.pct-a.pct);
  console.log('采样总数:', total, '（约', (total*0.2).toFixed(0), 'ms）');
  console.log('热点 TOP 15：');
  for (const r of rows.slice(0,15)) {
    console.log('  ' + (r.fn||'?').padEnd(24).slice(0,24), r.pct.toFixed(1).padStart(6) + '%',
      r.ms.toFixed(0).padStart(6) + 'ms', r.url);
  }
  ws.close();child.kill();process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1);});

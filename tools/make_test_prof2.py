"""跑一段时间后读 window.__prof，看各阶段累计耗时。"""
import pathlib

p = pathlib.Path("tools/test_prof.js")
p.write_text(r"""const fs=require('fs');const path=require('path');const os=require('os');
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9432;const ROOT=path.join(__dirname,'..');
const PAGE='file:///'+path.join(ROOT,'prototype','index.html').replace(/\\/g,'/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const child=spawn(EDGE,['--headless=new','--disable-gpu','--hide-scrollbars',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edgePR-'+Date.now()),
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
  await send('Runtime.evaluate',{expression:`
    window.__f=0; const o=window.requestAnimationFrame;
    window.requestAnimationFrame=function(cb){return o(function(t){window.__f++;return cb(t);});};
    window.__prof = {};
  `});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true});
    return r.result && r.result.value;};

  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[1];
    window.__rap.startLevel(1); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-2']);
    window.__rap.launch();
  })()`);
  await sleep(500);
  await ev('window.__prof = {}; window.__f = 0;');
  await sleep(3000);
  const frames = await ev('window.__f');
  const prof = JSON.parse(await ev('JSON.stringify(window.__prof)'));
  console.log('3 秒内帧数:', frames, '→', (frames/3).toFixed(1), 'fps');
  console.log('各阶段累计耗时 (ms) 与每帧平均:');
  const order = ['sky2','terrain','stone','pebble','grass','grass2','ice','end'];
  let total = 0;
  for (const k of order) {
    if (!(k in prof)) continue;
    total += prof[k];
    console.log('  ' + k.padEnd(10), prof[k].toFixed(1).padStart(8), '→ 每帧', (prof[k]/frames).toFixed(2), 'ms');
  }
  console.log('  ' + '合计'.padEnd(10), total.toFixed(1).padStart(8), '→ 每帧', (total/frames).toFixed(2), 'ms');
  ws.close();child.kill();process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1);});
""", encoding="utf-8")
print("written")

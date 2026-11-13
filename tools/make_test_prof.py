"""定位性能瓶颈：逐个关掉渲染模块，看帧率变化。

方法：在页面里注入开关，分别关闭石头纹理/丛林/粒子/速度线，各测 3 秒帧率。
"""
import pathlib

p = pathlib.Path("tools/test_perf_profile.js")
p.write_text(r"""const fs=require('fs');const path=require('path');const os=require('os');
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9427;const ROOT=path.join(__dirname,'..');
const PAGE='file:///'+path.join(ROOT,'prototype','index.html').replace(/\\/g,'/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const child=spawn(EDGE,['--headless=new','--disable-gpu','--hide-scrollbars',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edgePF-'+Date.now()),
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

  // 注入性能测量 + 开关
  await send('Runtime.evaluate',{expression:`
    window.__perf = { frames:0, t0:performance.now(), skip:{stone:false, jungle:false, dust:false, speedline:false} };
    const orig = window.requestAnimationFrame;
    window.requestAnimationFrame = function(cb){
      return orig(function(t){ window.__perf.frames++; return cb(t); });
    };
  `});

  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true});
    return r.result && r.result.value;};

  async function measure(label, ms){
    const f0 = await ev('window.__perf.frames');
    await sleep(ms);
    const f1 = await ev('window.__perf.frames');
    return { label, fps: +(((f1-f0)/(ms/1000))).toFixed(1) };
  }

  // 建车发射（用 1-2）
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[1];
    window.__rap.startLevel(1); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-2']);
    window.__rap.launch();
  })()`);
  await sleep(500);

  const results = [];
  results.push(await measure('基线（全部开启）', 3000));

  // 关掉粒子
  await ev('window.__perf.skip.dust = true; window.__rap.state.dust = []; window.__rap.state.debris = [];');
  results.push(await measure('关粒子', 2500));

  // 缩小画布像素（减少填充率）—— 直接改 DPR
  await ev(`(()=>{ const cv=document.getElementById('cv');
    cv.width = 640; cv.height = 360; })()`);
  results.push(await measure('画布降到 640x360', 2500));

  for (const r of results) console.log(r.label.padEnd(22), r.fps, 'fps');
  ws.close();child.kill();process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1);});
""", encoding="utf-8")
print("written")

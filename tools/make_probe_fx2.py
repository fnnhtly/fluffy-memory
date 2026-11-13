"""制造撞击并测量特效强度。

用"故意造一辆会撞的车"（长车身 + 高速下坡撞台阶）来触发 impact，
而不是用标准解（标准解太稳，不触发任何特效）。
"""
import pathlib

p = pathlib.Path("tools/probe_fx2.js")
p.write_text(r"""const fs=require('fs');const path=require('path');const os=require('os');
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9416;const ROOT=path.join(__dirname,'..');
const PAGE='file:///'+path.join(ROOT,'prototype','index.html').replace(/\\/g,'/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const child=spawn(EDGE,['--headless=new','--disable-gpu','--hide-scrollbars',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edgeY-'+Date.now()),
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

  // 1-3 有马达能跑到 12 m/s；造一个"头重"的车（前 4 格全木框 + 前轮省略）撞上去
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[2];
    window.__rap.startLevel(2); s.welcome=0; s.introT=1;
    s.build = R.newBuild();
    R.tryPlace(lv, s.build, 'wood_frame', 4, 1);
    R.tryPlace(lv, s.build, 'wood_frame', 4, 2);
    R.tryPlace(lv, s.build, 'wood_frame', 4, 3);
    R.tryPlace(lv, s.build, 'wood_frame', 4, 4);
    R.tryPlace(lv, s.build, 'wood_wheel', 5, 1);
    R.tryPlace(lv, s.build, 'wood_wheel', 5, 4);
    R.tryPlace(lv, s.build, 'pig', 4, 2);
    R.tryPlace(lv, s.build, 'motor', 4, 0);
    window.__rap.launch();
  })()`);

  const samples=[];
  for (let i=0;i<90;i++){
    await sleep(60);
    const d = await ev(`(()=>{const s=window.__rap.state;
      return JSON.stringify({shake:+(s.shake||0).toFixed(3), flash:+(s.flash||0).toFixed(3),
        vig:+(s.vignette||0).toFixed(3), deb:(s.debris||[]).length,
        slow:+(s.slowmo||0).toFixed(2), vx:+(s.run?s.run.car.vx:0).toFixed(1)});})()`);
    samples.push(JSON.parse(d));
  }

  const maxShake = Math.max(...samples.map(s=>s.shake));
  const maxFlash = Math.max(...samples.map(s=>s.flash));
  const maxVig = Math.max(...samples.map(s=>s.vig));
  const maxDeb = Math.max(...samples.map(s=>s.deb));
  const maxSlow = Math.max(...samples.map(s=>s.slow));
  const maxPx = maxShake * 0.55 / 2;
  console.log('震屏峰值 =', maxShake.toFixed(2), '→ 位移约', maxPx.toFixed(1), 'px =',
    (maxPx/1280*100).toFixed(2) + '% 屏宽   [参考 0.3%~0.8%]');
  console.log('闪帧峰值 =', (maxFlash*0.5).toFixed(2), '  [>0.4 刺眼]');
  console.log('暗角峰值 =', maxVig.toFixed(2));
  console.log('碎片峰值 =', maxDeb, ' 个');
  console.log('慢动作峰值 =', maxSlow.toFixed(2), 's');
  let flick=0;
  for (let i=1;i<samples.length-1;i++)
    if (samples[i].deb===0 && samples[i-1].deb>0 && samples[i+1].deb>0) flick++;
  console.log('碎片闪断次数 =', flick);
  console.log('errors:', errs.length?errs.join(' | '):'(none)');
  ws.close();child.kill();process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1);});
""", encoding="utf-8")
print("written")

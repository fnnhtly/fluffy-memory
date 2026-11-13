"""量化检查镜头震屏强度 + 粒子生命周期。

方法：在浏览器里直接读 state，连续采样，算出：
1. 震屏位移的峰值（像素）—— 太大像地震，太小没感觉。参考商业游戏约 0.3~0.8% 屏宽。
2. 闪帧透明度峰值 —— 太亮会刺眼。
3. 碎片/纸花的生命曲线 —— 是否会在某些帧全消失（闪断）。
"""
import pathlib

p = pathlib.Path("tools/probe_fx.js")
p.write_text(r"""const fs=require('fs');const path=require('path');const os=require('os');
const {spawn}=require('child_process');
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT=9415;const ROOT=path.join(__dirname,'..');
const PAGE='file:///'+path.join(ROOT,'prototype','index.html').replace(/\\/g,'/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const child=spawn(EDGE,['--headless=new','--disable-gpu','--hide-scrollbars',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edgeX-'+Date.now()),
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

  // 1-5 脆弱车会撞，触发震屏/闪帧/碎片
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[4];
    window.__rap.startLevel(4); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-5n']);
    window.__rap.launch();
  })()`);

  const samples=[];
  for (let i=0;i<70;i++){
    await sleep(70);
    const d = await ev(`(()=>{const s=window.__rap.state;
      return JSON.stringify({shake:+(s.shake||0).toFixed(3), flash:+(s.flash||0).toFixed(3),
        vig:+(s.vignette||0).toFixed(3), deb:(s.debris||[]).length,
        conf:(s.confetti||[]).length, slow:+(s.slowmo||0).toFixed(2)});})()`);
    samples.push(JSON.parse(d));
  }

  const maxShake = Math.max(...samples.map(s=>s.shake));
  const maxFlash = Math.max(...samples.map(s=>s.flash));
  const maxVig = Math.max(...samples.map(s=>s.vig));
  const maxDeb = Math.max(...samples.map(s=>s.deb));
  // 震屏最大位移：cam 里用了 (rand-0.5)*shake*0.55，而 1 设计像素 ≈ 屏幕像素
  const maxShakePx = maxShake * 0.55 / 2;
  const pctOfWidth = maxShakePx / 1280 * 100;

  console.log('震屏峰值 shake =', maxShake.toFixed(2), '→ 位移约', maxShakePx.toFixed(1), 'px =', pctOfWidth.toFixed(2) + '% 屏宽');
  console.log('  商业游戏参考区间：0.3% ~ 0.8% 屏宽');
  console.log('闪帧峰值透明度 =', (maxFlash*0.5).toFixed(2), '（>0.4 会刺眼）');
  console.log('暗角峰值 =', maxVig.toFixed(2));
  console.log('碎片峰值数量 =', maxDeb);
  // 闪断检测：碎片数量从 >0 突然归零又出现
  let flick = 0;
  for (let i=1;i<samples.length-1;i++){
    if (samples[i].deb === 0 && samples[i-1].deb > 0 && samples[i+1].deb > 0) flick++;
  }
  console.log('碎片闪断次数 =', flick);
  console.log('errors:', errs.length?errs.join(' | '):'(none)');
  ws.close();child.kill();process.exit(0);
})().catch(e=>{console.log('FAIL',e);process.exit(1);});
""", encoding="utf-8")
print("written")

/* 诊断：行驶阶段的右上「?」帮助按钮，到底有没有被计时面板盖住。
 *
 * 只做测量，不改代码。判据：按钮圆盘内的平均亮度。
 * 按钮本身 = 深底 + 金色描边 + 白色「?」，可见时平均亮度明显高于"被一整块深色面板盖住"。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);   // 随机端口：避免残留进程撞车
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeHc-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']);
    window.__rap.launch(); s.runBanner=0; return 1;})()`);
  await sleep(900);

  const geo = JSON.parse(await ev(`(()=>{
    const s=window.__rap.state;
    const b=window.__rap.btnRect('help');
    return JSON.stringify({b, phase:s.phase});
  })()`));
  console.log('帮助按钮矩形 =', JSON.stringify(geo.b), 'phase =', geo.phase);

  // 在按钮圆盘内按 3x3 细网格取样，统计平均亮度 / 最大亮度 / 金色像素数
  const probe = async (tag) => {
    const r = JSON.parse(await ev(`(()=>{
      const cv=document.querySelector('canvas');
      const dpr=cv.width/1280;
      const b=window.__rap.btnRect('help');
      const cx=(b.x+b.w/2)*dpr, cy=(b.y+b.h/2)*dpr, rad=(b.w/2)*dpr;
      const g=cv.getContext('2d',{willReadFrequently:true});
      let n=0,sum=0,mx=0,gold=0,samples=[];
      for(let yy=Math.floor(cy-rad); yy<=cy+rad; yy++){
        for(let xx=Math.floor(cx-rad); xx<=cx+rad; xx++){
          if(Math.hypot(xx-cx,yy-cy)>rad) continue;
          const d=g.getImageData(xx,yy,1,1).data;
          const lum=(d[0]*0.299+d[1]*0.587+d[2]*0.114);
          n++; sum+=lum; if(lum>mx) mx=lum;
          if(d[0]>140 && d[1]>110 && d[2]<170 && d[0]>d[2]+25) gold++;
        }
      }
      return JSON.stringify({n, mean:+(sum/n).toFixed(1), max:+mx.toFixed(1), gold});
    })()`));
    console.log(tag.padEnd(16), '平均亮度', String(r.mean).padStart(6), ' 最高', String(r.max).padStart(6),
      ' 金色像素', String(r.gold).padStart(4), '/', r.n);
    return r;
  };

  const runState = await probe('行驶阶段');

  // 对照：建造阶段同一个「?」按钮（在建造坞里，x/y 不同）不该被盖
  await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null; s.introT=1; return 1;})()`);
  await sleep(500);
  const buildProbe = JSON.parse(await ev(`(()=>{
    const cv=document.querySelector('canvas');
    const dpr=cv.width/1280;
    const b=window.__rap.btnRect('help');
    const cx=(b.x+b.w/2)*dpr, cy=(b.y+b.h/2)*dpr;
    const g=cv.getContext('2d',{willReadFrequently:true});
    let n=0,sum=0,mx=0,min=999;
    for(let yy=Math.floor(cy-b.h/2*dpr); yy<=cy+b.h/2*dpr; yy++){
      for(let xx=Math.floor(cx-b.w/2*dpr); xx<=cx+b.w/2*dpr; xx++){
        const d=g.getImageData(xx,yy,1,1).data;
        const lum=(d[0]*0.299+d[1]*0.587+d[2]*0.114);
        n++; sum+=lum; if(lum>mx) mx=lum; if(lum<min) min=lum;
      }
    }
    return JSON.stringify({bx:b.x,by:b.y,n,mean:+(sum/n).toFixed(1),max:+mx.toFixed(1),min:+min.toFixed(1)});
  })()`));
  console.log('建造阶段的「?」按钮 矩形=', buildProbe.bx + ',' + buildProbe.by,
    ' 平均亮度', buildProbe.mean, ' 最高', buildProbe.max);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, 'diag-hint-collide.png'), Buffer.from(shot.data, 'base64'));

  console.log('\n结论：行驶阶段按钮平均亮度', runState.mean,
    '，金色像素', runState.gold, '；建造阶段作为对照平均亮度', buildProbe.mean);
  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e); process.exit(1); });

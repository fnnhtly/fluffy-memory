/* 把"每块木框的四条边都画了吗"量干净。
 *
 * ⚠ 前几次失败的原因都记在下面，因为这个量与别的量不一样：
 *
 *   1. 用颜色阈值找木色 → 木框上有木纹(#6e4822)、内壁阴影、外描边(#7a4f22)、
 *      铁角(#6f7a86)，颜色一多就漏。改成「车 vs 背景」差集做掩码。
 *   2. 两次 getImageData 在同一次 JS 执行里 → 中间没渲染，差集恒为空
 *      （第一次量到"车体像素 0"）。改成两次 evaluate + 中间 sleep。
 *   3. 采样点算错半格 → 量到空气，读数全 0。
 *      现在把每格中心、每条边界的**世界坐标**先打出来核对。
 *   4. 焊接之后"共享墙只由一方画"，所以按格量必然有一格那条边是 0 ——
 *      那不是缺陷。判据必须是「**每条边界**上有没有墙」，不是「每格四边都满」。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const PORT = 9600 + Math.floor(Math.random() * 90);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeBound-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  for (const ang of [0, -0.35]) {
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(0); S.welcome=0; S.introT=1; S.phase='build'; S.run=null; S.runBanner=0;
      R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-1']);
      S.phase='build'; S.run=null; R.launch(); S.runBanner=0;
      S.run.phase='frozen';
      S.run.car.a=${ang}; S.run.car.vx=0; S.run.car.vy=0; S.run.car.w=0; S.run.car.odo=0;
      S.windFx=[]; S.dust=[]; S.bursts=[]; S.confetti=[]; S.debris=[]; S.shake=0;
      return 1;})()`);
    await sleep(1300);
    await ev(`(()=>{const S=window.__rap.state; const cm=S.camLastDraw||S.camLive;
      S.__lockCam={x:cm.x,y:cm.y,zoom:cm.zoom}; return 1;})()`);
    await sleep(400);

    await ev(`(()=>{const cv=document.getElementById('cv'), g=cv.getContext('2d');
      window.__A=g.getImageData(0,0,cv.width,cv.height).data;
      window.__kx=window.__rap.state.run.car.x; return 1;})()`);
    await ev('(()=>{window.__rap.state.run.car.x=9999; return 1;})()');
    await sleep(280);
    await ev(`(()=>{const cv=document.getElementById('cv'), g=cv.getContext('2d');
      window.__B=g.getImageData(0,0,cv.width,cv.height).data;
      window.__rap.state.run.car.x=window.__kx; return 1;})()`);
    await sleep(220);

    const res = JSON.parse(await ev(`(function(){
      var S=window.__rap.state, car=S.run.car, cm=S.camLastDraw;
      var cv=document.getElementById('cv'), v=window.__view;
      var K=cv.width/v.W, s=32*cm.zoom, W=cv.width, H=cv.height;
      var A=window.__A, B=window.__B;
      var mask=new Uint8Array(W*H), tot=0;
      for(var i=0,p=0;i<A.length;i+=4,p++){
        var d=Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2]);
        if(d>24){ mask[p]=1; tot++; }
      }
      var ca=Math.cos(car.a), sa=Math.sin(car.a);
      function hitW(wx, wy){
        var sx=640+(wx-cm.x)*s, sy=360-(wy-cm.y)*s;
        var X=Math.round((sx-v.offX)*K), Y=Math.round((sy-v.offY)*K);
        if(X<0||Y<0||X>=W||Y>=H) return false;
        return mask[Y*W+X]===1;
      }
      /* 局部 -> 世界 */
      function toW(lx, ly){ return { x: car.x + lx*ca - ly*sa, y: car.y + lx*sa + ly*ca }; }
      /* 沿一条局部线段采样覆盖率 */
      function cov(lx0, ly0, lx1, ly1){
        var n=0, h=0;
        for(var t=0.06;t<=0.941;t+=0.01){
          var lx=lx0+(lx1-lx0)*t, ly=ly0+(ly1-ly0)*t;
          var q=toW(lx,ly); n++; if(hitW(q.x,q.y)) h++;
        }
        return +(h/n).toFixed(2);
      }
      /* 每块木框（局部格坐标） */
      var cells=[];
      car.parts.forEach(function(p){
        if(!(p.def && p.def.structure) || p.inner) return;
        var cx=p.lx, cy=p.ly, hh=0.5;
        cells.push({ key:p.r+','+p.c, lx:+cx.toFixed(2), ly:+cy.toFixed(2),
          up:   cov(cx-hh*0.86, cy+hh*0.78, cx+hh*0.86, cy+hh*0.78),
          down: cov(cx-hh*0.86, cy-hh*0.78, cx+hh*0.86, cy-hh*0.78),
          left: cov(cx-hh*0.78, cy-hh*0.86, cx-hh*0.78, cy+hh*0.86),
          right:cov(cx+hh*0.78, cy-hh*0.86, cx+hh*0.78, cy+hh*0.86) });
      });
      /* 每条**边界线**上有没有墙（跨两格量，看焊接有没有留下洞） */
      var bounds=[];
      for (var c=0;c<4;c++){
        var bx = -2.0 + c;    /* 局部 x = -2,-1,0,+1 : 三格的左右边界 */
        bounds.push({ at:'x='+bx, cov: cov(bx, -0.34, bx, 0.34) });
      }
      bounds.push({ at:'顶部 y=+0.5', cov: cov(-1.9, 0.42, 0.9, 0.42) });
      bounds.push({ at:'底部 y=-0.5', cov: cov(-1.9, -0.42, 0.9, -0.42) });
      return JSON.stringify({ a:+car.a.toFixed(3), total:tot, cells:cells, bounds:bounds });
    })()`));

    console.log('');
    console.log('=== car.a = ' + res.a + '（' + (res.a * 180 / Math.PI).toFixed(0) + '°）  车体像素 ' + res.total + ' ===');
    res.cells.forEach(c => console.log('  ' + c.key + ' (局部 ' + c.lx + ',' + c.ly + ')' +
      '  上 ' + c.up + '  下 ' + c.down + '  左 ' + c.left + '  右 ' + c.right));
    console.log('  --- 边界线上的墙 ---');
    res.bounds.forEach(b => console.log('  ' + b.at.padEnd(12) + ' 覆盖 ' + b.cov));
  }

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

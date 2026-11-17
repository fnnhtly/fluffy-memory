/* 决定性实验：车身倾角 a 与"零件被画出来的朝向"是什么关系？
 *
 * 怀疑（第 76 轮）：`baseRot` 把 car.a 送进 `ctx.rotate`，而 canvas 的 y 轴向下，
 * 于是**画出来的旋转方向与"零件位置的旋转方向"相反** —— 零件相对车身转了 -2a。
 * 若成立，则 a = ±45° 时零件会相对车身转 ±90°，
 * 三块横排的木框会在"车身局部坐标系"里显示成**竖排**。
 * a = 0 时正常，a = 20° 时歪 40° —— 正好是用户在斜坡上看到的样子。
 *
 * 这个实验只看形状，不看颜色，也不改产品代码。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const PORT = 9000 + Math.floor(Math.random() * 90);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeSign-' + Date.now()),
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

  for (const deg of [0, 20, 45, 90]) {
    const a = deg * Math.PI / 180;
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(0); S.welcome=0; S.introT=1; S.phase='build'; S.run=null; S.runBanner=0;
      R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-1']);
      S.phase='build'; S.run=null; R.launch(); S.runBanner=0;
      S.run.phase='frozen';
      S.run.car.a=${a}; S.run.car.vx=0; S.run.car.vy=0; S.run.car.w=0; S.run.car.odo=0;
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
    await sleep(260);
    await ev(`(()=>{const cv=document.getElementById('cv'), g=cv.getContext('2d');
      window.__B=g.getImageData(0,0,cv.width,cv.height).data;
      window.__rap.state.run.car.x=window.__kx; return 1;})()`);
    await sleep(200);

    /* 在**车身局部坐标系**里画 ASCII：如果整车是刚体，任何 a 下都该长得一样。 */
    const art = await ev(`(function(){
      var S=window.__rap.state, car=S.run.car, cm=S.camLastDraw;
      var cv=document.getElementById('cv'), v=window.__view;
      var K=cv.width/v.W, s=32*cm.zoom, W=cv.width, H=cv.height;
      var A=window.__A, B=window.__B;
      var mask=new Uint8Array(W*H);
      for(var i=0,p=0;i<A.length;i+=4,p++){
        var d=Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2]);
        if(d>24) mask[p]=1;
      }
      var ca=Math.cos(car.a), sa=Math.sin(car.a);
      function hitLocal(lx, ly){
        var wx=car.x+lx*ca-ly*sa, wy=car.y+lx*sa+ly*ca;
        var sx=640+(wx-cm.x)*s, sy=360-(wy-cm.y)*s;
        var X=Math.round((sx-v.offX)*K), Y=Math.round((sy-v.offY)*K);
        if(X<0||Y<0||X>=W||Y>=H) return false;
        return mask[Y*W+X]===1;
      }
      var out=[];
      for (var ly=0.30; ly>=-2.05; ly-=0.10) {
        var row='';
        for (var lx=-2.60; lx<=1.60; lx+=0.09) row += hitLocal(lx,ly) ? '#' : '.';
        out.push(row);
      }
      return out.join('\\n');
    })()`);
    console.log('');
    console.log('########## car.a = ' + deg + '° （车身局部坐标系） ##########');
    console.log(art);
  }

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

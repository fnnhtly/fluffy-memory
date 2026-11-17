/* 决定性探针 v2：把"车"和"背景"两帧求差，得到精确的车体像素。
 *
 * ⚠ v1 量到"车体像素 0" —— 原因是两次 `getImageData` 在**同一次 JS 执行**里，
 * 中间没有渲染过任何一帧，两帧当然完全相同。
 * 现在拆成两次 evaluate，中间 `await sleep(240)` 让 rAF 真的跑一帧。
 *
 * 背景帧的取法：把 `car.x` 挪到地图外（镜头已锁死，画面不动）。
 * 不用清空 `car.parts` —— 第 70 轮踩过：空零件会让 drawRun 抛异常，
 * 画面冻结在上一帧，差集变成"所有像素都一样"。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeIso2-' + Date.now()),
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
      S.run.car.a = ${ang}; S.run.car.vx=0; S.run.car.vy=0; S.run.car.w=0;
      S.__lockCam = null;
      S.windFx=[]; S.dust=[]; S.bursts=[]; S.confetti=[]; S.debris=[]; S.shake=0;
      return 1;})()`);
    await sleep(1400);
    await ev(`(()=>{const S=window.__rap.state;
      const cm=S.camLastDraw||S.camLive;
      S.__lockCam={x:cm.x,y:cm.y,zoom:cm.zoom}; return 1;})()`);
    await sleep(400);

    /* 帧 A：有车 */
    await ev(`(()=>{const cv=document.getElementById('cv'), g=cv.getContext('2d');
      window.__A = g.getImageData(0,0,cv.width,cv.height).data;
      window.__keepX = window.__rap.state.run.car.x;
      return 1;})()`);
    /* 帧 B：车挪到地图外（镜头锁着，背景不动） */
    await ev('(()=>{window.__rap.state.run.car.x = 9999; return 1;})()');
    await sleep(260);
    await ev(`(()=>{const cv=document.getElementById('cv'), g=cv.getContext('2d');
      window.__B = g.getImageData(0,0,cv.width,cv.height).data;
      window.__rap.state.run.car.x = window.__keepX;
      return 1;})()`);
    await sleep(200);

    const res = JSON.parse(await ev(`(function(){
      var S=window.__rap.state, car=S.run.car, cm=S.camLastDraw;
      var cv=document.getElementById('cv'), g=cv.getContext('2d'), v=window.__view;
      var K=cv.width/v.W, s=32*cm.zoom;
      var ca=Math.cos(car.a), sa=Math.sin(car.a);
      var A=window.__A, B=window.__B, W=cv.width, H=cv.height;
      var mask=new Uint8Array(W*H), n=0;
      for(var i=0,p=0;i<A.length;i+=4,p++){
        var d=Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2]);
        if(d>24){ mask[p]=1; n++; }
      }
      function sc(lx,ly){
        return { x: 640 + ((car.x + lx*ca - ly*sa) - cm.x)*s,
                 y: 360 - ((car.y + lx*sa + ly*ca) - cm.y)*s };
      }
      function hit(sx,sy){
        var X=Math.round((sx-v.offX)*K), Y=Math.round((sy-v.offY)*K);
        if(X<0||Y<0||X>=W||Y>=H) return false;
        return mask[Y*W+X]===1;
      }
      function cov(ax, ay, bx, by){
        var hitN=0, tot=0;
        for(var t=0.12;t<=0.881;t+=0.02){
          var x=ax+(bx-ax)*t, y=ay+(by-ay)*t;
          tot++; if(hit(x,y)) hitN++;
        }
        return +(hitN/tot).toFixed(2);
      }
      var cells=[];
      car.parts.forEach(function(p){
        if(!(p.def && p.def.structure) || p.inner) return;
        var c = sc(p.lx, p.ly);
        var h = s*0.5*0.86;
        var ex = { x: ca*h, y: -sa*h };
        var ey = { x: sa*h, y: ca*h };
        cells.push({ key: p.r+','+p.c,
          topline: cov(c.x-ex.x, c.y-ey.y, c.x+ex.x, c.y-ey.y),
          botline: cov(c.x-ex.x, c.y+ey.y, c.x+ex.x, c.y+ey.y),
          left:    cov(c.x-ex.x, c.y-ey.y, c.x-ex.x, c.y+ey.y),
          right:   cov(c.x+ex.x, c.y-ey.y, c.x+ex.x, c.y+ey.y) });
      });
      var cx=640+(car.x-cm.x)*s, cy=360-(car.y-cm.y)*s;
      var Hh=1.7*s, step=2/K, rows=[];
      for(var dy=-Hh; dy<=Hh; dy+=step){
        var row='';
        for(var dx=-Hh; dx<=Hh; dx+=step){
          var X=Math.round((cx+dx-v.offX)*K), Y=Math.round((cy+dy-v.offY)*K);
          if(X<0||Y<0||X>=W||Y>=H){ row+=' '; continue; }
          row += mask[Y*W+X] ? '#' : '.';
        }
        rows.push(row);
      }
      return JSON.stringify({ a:+car.a.toFixed(3), n:n, sidx:+s.toFixed(1),
        cells:cells, rows:rows });
    })()`));

    console.log('');
    console.log('=== car.a = ' + res.a + '（' + (res.a*180/Math.PI).toFixed(0) +
      '°）  车体像素 ' + res.n + '  格=' + res.sidx + 'px ===');
    res.cells.forEach(c => console.log('  ' + c.key + '  上 ' + c.topline +
      '  下 ' + c.botline + '  左 ' + c.left + '  右 ' + c.right));
    console.log(res.rows.join('\n'));
  }

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

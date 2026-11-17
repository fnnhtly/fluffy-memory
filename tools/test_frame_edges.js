/* 「木框不要这样少一边」—— 把它变成可数的判据（第 76 轮）。
 *
 * ── 用户看到的是什么 ──
 *
 * 截图里车在斜坡上，三块并排木框看起来**每块都缺一条边**、而且**各自歪着**。
 * 根因是 `baseRot` 把 `car.a` 符号搞反了（世界 Y 向上、canvas Y 向下），
 * 于是零件相对车身多转 2a：斜坡 20° 就是 40°。
 * 位置没变、朝向多转 40° —— 每块框的竖边被转到格子外面去了，
 * 缝没了，看起来就是"少一边 + 各自旋转"。
 *
 * ── 判据 ──
 *
 * 对 1-1 那排三块木框，在若干倾角下量：
 *   A. 四条**竖缝**（局部 x = -2 / -1 / 0 / +1）都还有墙（覆盖率 ≥ 0.40）；
 *   B. **上下两条长边**（局部 y = 0 / -1）都还在；
 *   C. 各倾角之间这些读数**几乎不变**（差值 ≤ 0.12）——
 *      刚体的缝不会因为车身歪了就消失。
 *
 * 修之前实测：a=0 时竖缝 0.51~0.53，a=-20° 时掉到 0.08~0.11 —— 缝基本没了。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const PORT = 9500 + Math.floor(Math.random() * 90);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeEdge76-' + Date.now()),
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
  const errs = [];
  ws.addEventListener('message', e2 => {
    try { const m = JSON.parse(e2.data);
      if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text);
    } catch (e) {}
  });
  /* ⚠ ev 必须把**求值异常**报出来。`Runtime.evaluate` 抛异常时
   * `result.value` 是 undefined，直接 `JSON.parse` 会得到
   * 「"undefined" is not valid JSON」—— 那句红完全不指向真因
   * （第 76 轮就踩了一次）。 */
  const ev = async e => {
    const r = await send('Runtime.evaluate',
      { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('页面求值异常：' + (d.exception && d.exception.description || d.text));
    }
    return r.result.value;
  };
  ws.addEventListener('message', e2 => {
    try { const m = JSON.parse(e2.data);
      if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text);
    } catch (e) {}
  });

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  async function measure(deg) {
    const a = deg * Math.PI / 180;
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(0); S.welcome=0; S.introT=1; S.phase='build'; S.run=null; S.runBanner=0;
      R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-1']);
      S.phase='build'; S.run=null; R.launch(); S.runBanner=0;
      S.run.phase='frozen';
      S.run.car.a=${a}; S.run.car.vx=0; S.run.car.vy=0; S.run.car.w=0; S.run.car.odo=0;
      S.__lockCam=null;
      S.windFx=[]; S.dust=[]; S.bursts=[]; S.confetti=[]; S.debris=[]; S.shake=0;
      return 1;})()`);
    await sleep(1250);
    await ev(`(()=>{const S=window.__rap.state; const cm=S.camLastDraw||S.camLive;
      S.__lockCam={x:cm.x,y:cm.y,zoom:cm.zoom}; return 1;})()`);
    await sleep(380);
    await ev(`(()=>{const cv=document.getElementById('cv'), g=cv.getContext('2d');
      window.__A=g.getImageData(0,0,cv.width,cv.height).data;
      window.__kx=window.__rap.state.run.car.x; return 1;})()`);
    await ev('(()=>{window.__rap.state.run.car.x=9999; return 1;})()');
    await sleep(260);
    await ev(`(()=>{const cv=document.getElementById('cv'), g=cv.getContext('2d');
      window.__B=g.getImageData(0,0,cv.width,cv.height).data;
      window.__rap.state.run.car.x=window.__kx; return 1;})()`);
    await sleep(200);
    return JSON.parse(await ev(`(function(){
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
      function hit(lx, ly){
        var wx=car.x+lx*ca-ly*sa, wy=car.y+lx*sa+ly*ca;
        var sx=640+(wx-cm.x)*s, sy=360-(wy-cm.y)*s;
        var X=Math.round((sx-v.offX)*K), Y=Math.round((sy-v.offY)*K);
        if(X<0||Y<0||X>=W||Y>=H) return 0;
        return mask[Y*W+X];
      }
      function cov(lx0,ly0,lx1,ly1){
        var n=0,h=0;
        for(var t=0.03;t<=0.971;t+=0.01){
          var lx=lx0+(lx1-lx0)*t, ly=ly0+(ly1-ly0)*t;
          n++; if(hit(lx,ly)) h++;
        }
        return +(h/n).toFixed(3);
      }
      /* 三块木框：局部中心 lx = -1.5 / -0.5 / +0.5，ly = -0.5；边长 1。
       * 所以竖缝在 lx = -2,-1,0,+1；上下长边在 ly = 0 与 ly = -1。
       * 采样范围：竖缝扫整格高 ly ∈ [-0.94, -0.06]，
       * 长边扫整排宽 lx ∈ [-1.94, +0.94]（两端各留 0.06 避开包边）。 */
      const vseams = [-2, -1, 0, 1].map(x => ({
        at: 'x=' + x, cov: cov(x, -0.94, x, -0.06) }));
      const hseams = [
        { at: '上边 y=-0.06', cov: cov(-1.94, -0.06, 0.94, -0.06) },
        { at: '下边 y=-0.94', cov: cov(-1.94, -0.94, 0.94, -0.94) }
      ];
      return JSON.stringify({ vertical: vseams, horizontal: hseams });
    })()`));
  }

  const data = {};
  for (const deg of [0, 20, -20]) {
    data[deg] = await measure(deg);
    A.log('倾角 ' + deg + '°：竖缝 [' +
      data[deg].vertical.map(q => q.cov).join(', ') + ']  长边 [' +
      data[deg].horizontal.map(q => q.cov).join(', ') + ']');
  }

  // A 每个倾角、每条竖缝都要有墙
  for (const deg of [0, 20, -20]) {
    const low = data[deg].vertical.filter(q => q.cov < 0.90);
    A.chk('A 倾角 ' + deg + '° 时四条竖缝都还在（每格覆盖率 ≥ 0.90）',
      low.length === 0, low.length ? low.map(q => q.at + '=' + q.cov).join(', ') : '全部 ≥0.90');
    const lh = data[deg].horizontal.filter(q => q.cov < 0.90);
    A.chk('B 倾角 ' + deg + '° 时上下两条长边都还在', lh.length === 0,
      lh.length ? lh.map(q => q.at + '=' + q.cov).join(', ') : '都在');
  }

  // C 倾角之间读数几乎不变（刚体的缝不会因为歪了就消失）
  {
    let worst = 0, at = '';
    for (let i = 0; i < 4; i++) {
      const vals = [0, 20, -20].map(d => data[d].vertical[i].cov);
      const d = Math.max(...vals) - Math.min(...vals);
      if (d > worst) { worst = d; at = 'x=' + [-2, -1, 0, 1][i]; }
    }
    A.chk('C 倾角变化时竖缝覆盖率几乎不变（极差 ≤ 0.12，刚体）',
      worst <= 0.12, '最大极差 ' + worst.toFixed(3) + ' 在 ' + at);
  }

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

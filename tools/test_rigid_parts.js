/* 整车必须是刚体：**在车身局部坐标系里，任何倾角下的形状都必须一样**。
 *
 * 这一条是用户那句「木框不要这样少一边，零件不要各自旋转」的可数翻译。
 * 不是"看起来像"，是"同一辆车、同一个局部坐标系，画出来必须是同一个形状"。
 *
 * ── 为什么这条以前没有 ──
 *
 * `test_weld` 在**建造期**量接缝（那时 car.a 恒为 0），
 * `test_parts_connected` 也是建造期。行驶期的形状从来没有被量过。
 * 于是"零件被画成 2a 的偏转"这个 bug 可以一路活到用户截图。
 *
 * ── 怎么量 ──
 *
 * 1. 把车冻在指定倾角，锁镜头；
 * 2. 抓两帧求差（车 / 车挪到地图外）得到车的像素掩码；
 * 3. 在**车身局部坐标**上铺一张粗网格（每格 0.05 世界格），
 *    逐点问"屏幕上有车吗"；
 * 4. 各个倾角的网格与 a=0 的网格逐点比对。
 *
 * 判据：
 *   A. 每个倾角都和 a=0 高度一致（一致率 ≥ 0.92）；
 *   B. 反向对照 —— a=0 自己和自己比必须是 1.00，
 *      否则"一致率"这个量本身在抖，A 就没有意义。
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
  const PORT = 9800 + Math.floor(Math.random() * 90);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeRigid-' + Date.now()),
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

  const errs = [];
  ws.addEventListener('message', e2 => {
    try { const m = JSON.parse(e2.data);
      if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text);
    } catch (e) {}
  });

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  /* 在指定倾角下渲染一帧，并返回车身局部坐标上的粗网格。 */
  async function sampleAt(deg) {
    const a = deg * Math.PI / 180;
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(0); S.welcome=0; S.introT=1; S.phase='build'; S.run=null; S.runBanner=0;
      R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-1']);
      S.phase='build'; S.run=null; R.launch(); S.runBanner=0;
      S.run.phase='frozen';
      S.run.car.a=${a}; S.run.car.vx=0; S.run.car.vy=0; S.run.car.w=0; S.run.car.odo=0;
      S.__lockCam = null;
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
      /* 局部网格：x -2.6..1.6, y -2.3..0.4，步长 0.06 */
      var gx0=-2.60, gx1=1.60, gy0=-2.30, gy1=0.40, st=0.06;
      var cells=[];
      for (var ly=gy1; ly>=gy0; ly-=st)
        for (var lx=gx0; lx<=gx1; lx+=st)
          cells.push(hit(lx, ly));
      return JSON.stringify({ n: cells.length, cells: cells });
    })()`));
  }

  const base = await sampleAt(0);
  A.log('局部网格 ' + base.n + ' 点');

  /* 容忍 ±1 格的比对。
   *
   * 为什么要容忍：采样网格是世界坐标上的规则网格，而车是被 `ctx.rotate`
   * 转着画的 —— 同一个局部点落在屏幕上的位置会随倾角移动亚像素，
   * 边缘那一圈必然有抖动（B0 自比就有 0.2% 在跳）。
   * 只看"某个点前后差一格"的容差不会放过"零件歪了 40°"这种结构性差异：
   * 那种差异是整条边框跑到格子外面，不是一格以内。
   *
   * ⚠ 这个宽容度必须被反向验证过（见 tools/_redproof_rigid.js）：
   * 把 −a 改回 +a，判据必须照样红。 */
  const GW = Math.round((1.60 - -2.60) / 0.06) + 1;
  const tolMatch = (a, b) => {
    /* a、b 都是 n 点的一维数组，按 (行, 列) 排。 */
    let ok = 0;
    /* 先把 b 转成二维便于取邻居 */
    const rows = Math.ceil(b.length / GW);
    const get = (r, c) => (r < 0 || c < 0 || r >= rows || c >= GW || r * GW + c >= b.length)
      ? null : b[r * GW + c];
    for (let i = 0; i < a.length; i++) {
      const r = Math.floor(i / GW), c = i % GW;
      if (get(r, c) === a[i]) { ok++; continue; }
      let near = false;
      for (let dr = -1; dr <= 1 && !near; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (get(r + dr, c + dc) === a[i]) { near = true; break; }
        }
      }
      if (near) ok++;
    }
    return ok / a.length;
  };

  /* 自比：同一倾角取两次，必须几乎完全一致（量具本身不抖）。 */
  const base2 = await sampleAt(0);
  const same = tolMatch(base.cells, base2.cells);
  A.chk('B0 前提：同一个倾角取两次，形状完全一致（量具不抖）',
    same >= 0.995, (same * 100).toFixed(1) + '%');

  const rows = [];
  for (const deg of [20, -20, 45]) {
    const q = await sampleAt(deg);
    const agree = tolMatch(base.cells, q.cells);
    rows.push({ deg, agree: +(agree * 100).toFixed(1) });
    A.log('倾角 ' + deg + '°：与 0° 的形状一致率 ' + (agree * 100).toFixed(1) + '%');
  }
  rows.forEach(r => {
    A.chk('A 倾角 ' + r.deg + '° 时车身形状与 0° 一致（≥95%，刚体）',
      r.agree >= 95, r.agree + '%');
  });

  /* ═══════════ C 每一件零件收到的旋转角必须**完全一致** ═══════════
   *
   * A 组的轮廓比对对**圆形的轮子**不敏感：轮子跟不跟车身转，
   * 剪影几乎不变（反向验证时这一条确实漏掉了 —— 把轮子改回 `baseRot = 0`
   * 仍然是 4/4）。但轮子上有辐条、偏心配重块、单侧亮片、高光弧，
   * 它们对内壁位置**非常**敏感。所以直接问渲染层：
   * 这一帧里，每件零件画下去时的旋转角是多少？
   *
   * 钩 `ctx.translate` / `ctx.rotate`：drawPartShape 的固定结构是
   * `translate(零件中心)` 紧跟 `rotate(朝向)`，配对即可。
   *
   * 判据（a = 20°，odo = 0 所以 spin = 0）：
   *   · 不能出现 0 弧度 —— 出现就说明有零件（最可能是轮子）没跟车身转；
   *   · 不能出现 **+**a —— 出现就说明符号又反了；
   *   · 必须出现 **−**a。
   */
  {
    /* ⚠ 必须**自己**把状态摆到 20°。
     * 第一版直接沿用 A 组最后一次采样留下的 45°，于是钩到的是 −0.7854（−45°），
     * 而期望写的是 −0.349（−20°）→ C3 红。红得有道理：它量的确实是 45°。
     * 测试绝不能假设"上一段留下的状态是什么"。 */
    const a = 20 * Math.PI / 180;
    await sampleAt(20);
    await ev(`(()=>{
      const P = CanvasRenderingContext2D.prototype;
      if (!window.__origT) {
        window.__origT = P.translate; window.__origR = P.rotate;
        P.translate = function (x,y) { window.__sq = window.__sq || []; window.__sq.push(['T',x,y]); return window.__origT.call(this,x,y); };
        P.rotate = function (r) { window.__sq = window.__sq || []; window.__sq.push(['R',r]); return window.__origR.call(this,r); };
      }
      window.__sq = [];
      return 1;})()`);
    await sleep(420);
    const vals = JSON.parse(await ev(`(()=>{
      const sq = window.__sq || [];
      const out = [];
      for (let i = 0; i + 1 < sq.length; i++) {
        if (sq[i][0] === 'T' && sq[i+1][0] === 'R') out.push(+sq[i+1][1].toFixed(4));
      }
      return JSON.stringify(out);})()`));
    const big = vals.filter(v => Math.abs(v) > 0.2);
    const ZERO = 1e-6;
    A.log('倾角 20° 时零件收到的旋转角（|θ|>0.2 的）：' +
      JSON.stringify([...new Set(big)].sort((x, y) => x - y)));
    A.chk('C1 没有任何零件保持直立（不出现 0 弧度）',
      !vals.some(v => Math.abs(v) < ZERO), '0 出现 ' + vals.filter(v => Math.abs(v) < ZERO).length + ' 次');
    A.chk('C2 没有任何零件转了 +a（符号没反）',
      !big.some(v => Math.abs(v - a) < 0.02),
      '目标 −' + a.toFixed(3) + '，实际 ' + JSON.stringify([...new Set(big)]));
    A.chk('C3 零件确实转了 −a（和车身同角反向，与 Y 轴朝下相抵）',
      big.some(v => Math.abs(v + a) < 0.02), '−a = ' + (-a).toFixed(3));
  }

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

/* 用户要求：「把这个缺边的机制删了」（第 78 轮）。
 *
 * ── 要删的是什么 ──
 *
 * 第 69 轮为了"让车上的零件都连起来"，做了一套**焊接边**：
 * 相邻的两个结构件共用一面墙，每条边按 (行,列) 字典序决定由谁画。
 * 于是每块木框只画"朝向外部"的边。
 *
 * 用户的判断是：那看起来像**每块都缺一条边**。上一轮（第 77 轮）已经
 * 证明了另一个更严重的根因（零件各自旋转是 car.a 的符号错了），
 * 修完之后缝是对齐了 —— 但"缺边"这个观感还在，因为它就是焊接本身。
 *
 * 这一轮按用户要求把整套机制**删掉**：每个框都画完整四边。
 *
 * ── 判据 ──
 *
 *   A `weldedEdges` / `WELD_GRID` / `buildHasStruct` / `runHasStruct`
 *     在页面里**一个都不剩**（名字、调用、注释）；
 *   B `drawPartShape` 的签名只剩 8 个参数（没有 edges）；
 *   C 建造期/行驶期两块木框**各自四边都有木色**（不再有"谁画谁不画"）；
 *   D 相邻两块之间的接缝现在**两层边框**（≈0.45 格）—— 这是删掉焊接的
 *     预期代价，不是回归。判据是"≥ 0.35 格"，与旧的 ≤0.30 相反。
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
  const PORT = 9700 + Math.floor(Math.random() * 80);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeNoWeld-' + Date.now()),
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
      if (m.method === 'Runtime.exceptionThrown')
        errs.push(m.params.exceptionDetails.text + ' ' +
          (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || ''));
    } catch (e) {}
  });
  const ev = async e => {
    const r = await send('Runtime.evaluate',
      { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('页面求值异常：' + (d.exception && d.exception.description || d.text));
    }
    return r.result.value;
  };

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(350);

  // ═════════════ A 名字一个都不剩 ═════════════
  {
    const src = await ev(`(async () => {
      const r = await fetch(location.href);
      return await r.text();})()`);
    const names = ['weldedEdges', 'WELD_GRID', 'WELD_NAMES', 'buildHasStruct', 'runHasStruct'];
    names.forEach(n => {
      const c = (src.match(new RegExp(n, 'g')) || []).length;
      A.chk('A ' + n + ' 在页面里一个都不剩', c === 0, c + ' 处');
    });
  }

  // ═════════════ B drawPartShape 只剩 8 个参数 ═════════════
  {
    const sig = await ev(`(()=>{try{
      return String(window.__rap.RAP && 0) + '|' +
        (typeof experience === 'undefined' ? 'na' : 'na');
    }catch(e){return 'err';}})()`);
    void sig;
    const src = await ev(`(async () => {
      const r = await fetch(location.href);
      return await r.text();})()`);
    const m = src.match(/function drawPartShape\(([^)]*)\)/);
    A.chk('B 页面里 drawPartShape 的签名能找到', !!m, m ? m[1] : '找不到');
    if (m) {
      const args = m[1].split(',').map(x => x.trim());
      A.chk('B2 drawPartShape 只剩 8 个参数（没有 edges）',
        args.length === 8 && args.indexOf('edges') < 0, args.join(' / '));
    }
  }

  // ═════════════ C 每块木框四条边都有木色 ═════════════
  /* 用"车 vs 背景"差集取掩码（前几轮反复验证过的做法），
   * 在**建造期**量（那里 car.a 恒 0，没有倾角干扰）。 */
  await ev(`(()=>{const R=window.__rap, S=R.state;
    R.startLevel(0); S.welcome=0; S.introT=1; S.phase='build'; S.run=null; S.runBanner=0;
    R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-1']);
    S.phase='build'; S.run=null; R.launch(); S.runBanner=0;
    S.run.phase='frozen';
    S.run.car.a=0; S.run.car.vx=0; S.run.car.vy=0; S.run.car.w=0; S.run.car.odo=0;
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
      for(var t=0.12;t<=0.881;t+=0.015){
        var lx=lx0+(lx1-lx0)*t, ly=ly0+(ly1-ly0)*t;
        n++; if(hit(lx,ly)) h++;
      }
      return +(h/n).toFixed(2);
    }
    var cells=[];
    car.parts.forEach(function(p){
      if(!(p.def && p.def.structure) || p.inner) return;
      var cx=p.lx, cy=p.ly, hh=0.5;
      cells.push({ key:p.r+','+p.c,
        up:  cov(cx-hh*0.80, cy+hh*0.80, cx+hh*0.80, cy+hh*0.80),
        dn:  cov(cx-hh*0.80, cy-hh*0.80, cx+hh*0.80, cy-hh*0.80),
        lf:  cov(cx-hh*0.80, cy-hh*0.80, cx-hh*0.80, cy+hh*0.80),
        rt:  cov(cx+hh*0.80, cy-hh*0.80, cx+hh*0.80, cy+hh*0.80) });
    });
    /* 接缝宽度：两格之间的木色横带有多厚 */
    return JSON.stringify({ cells: cells });
  })()`));

  res.cells.forEach(c => {
    A.log('木框@' + c.key + '  上 ' + c.up + '  下 ' + c.dn + '  左 ' + c.lf + '  右 ' + c.rt);
    A.chk('C 木框@' + c.key + ' 四条边都画了（每边木色覆盖率 ≥ 0.6）',
      c.up >= 0.6 && c.dn >= 0.6 && c.lf >= 0.6 && c.rt >= 0.6,
      [c.up, c.dn, c.lf, c.rt].join('/'));
  });

  // ═════════════ D 接缝现在是两层边框（删掉焊接的预期代价） ═════════════
  {
    const seam = JSON.parse(await ev(`(()=>{
      const S=window.__rap.state, car=S.run.car, cm=S.camLastDraw;
      const cv=document.getElementById('cv'), v=window.__view;
      const K=cv.width/v.W, s=32*cm.zoom, W=cv.width, H=cv.height;
      const A=window.__A, B=window.__B;
      const mask=new Uint8Array(W*H);
      for(let i=0,p=0;i<A.length;i+=4,p++){
        const d=Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2]);
        if(d>24) mask[p]=1;
      }
      const ca=Math.cos(car.a), sa=Math.sin(car.a);
      /* 水平扫描：穿过两格之间的竖直接缝，量木色横带的厚度（格）。
       *
       * 扫描线的局部 ly 要取**木框中心**（-0.5），不是 -0.8。
       * 第一版把 ly 又减了一次 0.8，扫到的是框下方空气，读数 0。
       * 这里显式写成 ly，和 cells 那边同一套坐标。 */
      let best = 0;
      for (const ly of [-0.38, -0.5, -0.62]) {
        for (const boundary of [-1.0, 0.0]) {
          let run = 0, maxRun = 0;
          for (let lx = boundary - 0.5; lx <= boundary + 0.5; lx += 0.004) {
            const wx = car.x + lx*ca - ly*sa, wy = car.y + lx*sa + ly*ca;
            const sx = 640 + (wx-cm.x)*s, sy = 360 - (wy-cm.y)*s;
            const X = Math.round((sx-v.offX)*K), Y = Math.round((sy-v.offY)*K);
            const on = (X>=0&&Y>=0&&X<W&&Y<H) ? mask[Y*W+X] : 0;
            if (on) { run += 0.004; if (run > maxRun) maxRun = run; }
            else run = 0;
          }
          /* 取离 boundary 最近的那一段 */
          if (maxRun > best) best = maxRun;
        }
      }
      return JSON.stringify({ cells: +best.toFixed(3) });
    })()`));
    A.log('并排木框之间的接缝木色厚度 ≈ ' + seam.cells + ' 格（单块边框 0.22，两层 0.44）');
    A.chk('D 接缝是**两层**边框（≥ 0.35 格）—— 这是删掉焊接的预期代价',
      seam.cells >= 0.35, seam.cells + ' 格');
  }

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

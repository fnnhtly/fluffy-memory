/* 「车上的零件都连起来」——把用户那句要求翻译成两条可数的判据。
 *
 * 用户原话：「我想让车上的零件都连起来，比如两个木框的两边粘连起来，
 * 不会在下坡时各自转动」。
 *
 * ── 判据怎么切分 ──
 *
 * "连起来"不是"任意两件相邻的零件之间都不能有背景"。气球旁边是风车桨，
 * 两个圆东西并排，中间当然是空的 —— 那不是缺陷，那是两个零件。
 * 真正要焊住的只有两种关系：
 *
 *   判据 B：**结构件 ↔ 结构件**。这就是用户举的例子（两个木框的两边）。
 *           两条边必须共用一条墙，接缝上不能露出背景。
 *   判据 C：**挂在结构件上方/下方的零件**。气球、沙袋、风车桨之类
 *           通过一根杆、一根绳、一道梁接在车上。接缝**中央那一段**
 *           必须被画到（连接件只需要一根，不需要铺满整条边）。
 *
 * 非结构件之间的相邻（风车桨 ↔ 气球）不判 —— 它们不该被画成焊在一起。
 *
 * ── 为什么在建造期量 ──
 *
 * 这个探针在第 70 轮改了六次，前五次都在行驶期做"抓两帧求差"，全部失败：
 *   1. 没等镜头收敛 → 两帧地形平移，差集横跨整个屏幕；
 *   2. 只在一列上扫 → 风车桨叶片是放射状的，单个 x 列未必有叶片穿过，
 *      把叶片之间的空隙读成"缝"，改画法读数不变（量的根本不是画法）；
 *   3. 用颜色枚举零件 → 漏了气球绳(#8a6a4a)、沙袋束带(#6b563a)；
 *   4. 清空 car.parts 再抓一帧 → drawRun 在空零件上抛异常被 try/catch 吞掉，
 *      画面停在上一帧，"空场景"和"整台车"几乎一样（零件中心一个都不在掩码里）；
 *   5. 探针点取格子中心 → 木框是**中空**的，中心本来就是背景，读成"没画到"。
 * 建造期没有物理、拼装视图锚在世界坐标上静止、drawBuildCar() 每帧现读 cells，
 * 用的还是同一个 drawPartShape —— 这才是稳定的量法。
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
  const PORT = 9750 + Math.floor(Math.random() * 60);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeConn-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  await ev(`(()=>{const R=window.__rap, S=R.state;
    R.startLevel(5); S.welcome=0; S.introT=1; S.phase='build'; S.run=null; S.runBanner=0;
    R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-6']);
    return 1;})()`);
  await sleep(900);

  await ev(`(()=>{const cv=document.getElementById('cv'), g=cv.getContext('2d');
    window.__A = g.getImageData(0,0,cv.width,cv.height).data; return 1;})()`);
  await sleep(320);
  const selfDiff = await ev(`(()=>{const cv=document.getElementById('cv'), g=cv.getContext('2d');
    const B = g.getImageData(0,0,cv.width,cv.height).data, A = window.__A;
    let n = 0;
    for (let i = 0; i < A.length; i += 4)
      if (Math.abs(A[i]-B[i]) + Math.abs(A[i+1]-B[i+1]) + Math.abs(A[i+2]-B[i+2]) > 24) n++;
    return n;})()`);

  await ev(`(()=>{const S=window.__rap.state;
    window.__sc = JSON.stringify(S.build.cells); window.__so = S.build.order.slice();
    S.build.cells = {}; S.build.order = []; return 1;})()`);
  await sleep(320);
  await ev(`(()=>{const cv=document.getElementById('cv'), g=cv.getContext('2d');
    window.__B = g.getImageData(0,0,cv.width,cv.height).data; return 1;})()`);
  await ev(`(()=>{const S=window.__rap.state;
    S.build.cells = JSON.parse(window.__sc); S.build.order = window.__so; return 1;})()`);
  await sleep(200);

  const res = JSON.parse(await ev(`(function(){
    var S=window.__rap.state, R=window.__rap;
    /* PARTS 挂在 __rap.RAP.PARTS 上，不在 __rap.PARTS。
     * 写成 R.PARTS 会得到 undefined，然后 d.inner 抛异常，
     * evaluate 整体返回 undefined，外面 JSON.parse 报
     * 「"undefined" is not valid JSON」—— 报错位置和真因隔了两层。 */
    var PARTS = R.RAP.PARTS;
    var cv=document.getElementById('cv'), v=window.__view;
    var K = cv.width / v.W, W = cv.width, H = cv.height;
    var A = window.__A, B = window.__B, o = R.buildOrigin(), PX = o.px;

    var mask = new Uint8Array(W*H), nMask = 0;
    for (var i = 0, p = 0; i < A.length; i += 4, p++) {
      var d = Math.abs(A[i]-B[i]) + Math.abs(A[i+1]-B[i+1]) + Math.abs(A[i+2]-B[i+2]);
      if (d > 24) { mask[p] = 1; nMask++; }
    }
    function cov(x, y) {
      var dx = Math.round((x - v.offX) * K), dy = Math.round((y - v.offY) * K);
      if (dx < 0 || dx >= W || dy < 0 || dy >= H) return null;
      return mask[dy*W + dx] === 1;
    }
    function center(r, c) {
      return { x: o.x + c*PX + PX/2, y: o.y + r*PX + PX/2 };
    }
    /* 可见性探针：**九点采样**（四角内缩 + 四边中点 + 中心），任一被画到就算可见。
     * 单点探针会误报：木框是空心的（中心是背景），风车桨的叶片是放射状的
     * （边框中点正好落在两条叶片之间），气球顶部是圆的（角上是空的）。
     * 第 6 次踩的坑 —— 单点探针报"量具看不见车"，而车画得好好的。 */
    function visible(r, c) {
      var pts = [[0.5,0.5],[0.5,0.1],[0.5,0.9],[0.1,0.5],[0.9,0.5],
                 [0.15,0.15],[0.85,0.15],[0.15,0.85],[0.85,0.85]];
      for (var i = 0; i < pts.length; i++) {
        var c2 = cov(o.x + c*PX + pts[i][0]*PX, o.y + r*PX + pts[i][1]*PX);
        if (c2 === true) return true;
      }
      return false;
    }
    /* 沿一条线采样覆盖率；band 给定时只取中间那一段 */
    function coverage(x0, y0, x1, y1, band) {
      var N = 32, hit = 0, tot = 0;
      for (var k = 0; k <= N; k++) {
        var t = k / N;
        var x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        if (band !== undefined && Math.abs(t - 0.5) * 2 > band) continue;
        var c = cov(x, y);
        if (c === null) continue;
        tot++; if (c) hit++;
      }
      return tot ? hit / tot : 0;
    }
    /* 「有没有一根连接件跨过接缝」——不是"整条边都被填满"。
     * 连接件的形态是**一根**：气球的绳、风车桨的立杆、轮子的轮毂，
     * 它们在接缝上只占一小段。要求整条边都填满是错的判据（会把
     * 一个正常的气球判成"断的"）。正确判据是：
     *   接缝上存在**一段连续的覆盖**，且这一段包含中点附近。
     * 用"最长的连续覆盖段的中心是否落在中段"来判断，
     * 这样即使连接件偏心一点点也仍然算连上，而完全断开时最长段为 0。 */
    function bridge(x0, y0, x1, y1) {
      var N = 32, arr = [];
      for (var k = 0; k <= N; k++) {
        var t = k / N;
        var c = cov(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        arr.push(c === null ? 0 : (c ? 1 : 0));
      }
      var bestLen = 0, bestMid = 0, run = 0, start = 0;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i]) {
          if (run === 0) start = i;
          run++;
          if (run > bestLen) { bestLen = run; bestMid = (start + i) / 2; }
        } else run = 0;
      }
      var midIdx = N / 2;
      return { longest: bestLen, total: arr.length,
        centred: bestLen >= 2 && Math.abs(bestMid - midIdx) <= N * 0.30,
        span: +(bestLen / arr.length).toFixed(3) };
    }

    var cells = S.build.cells;
    var probe = [];
    var structPairs = [];     /* 判据 B：结构件 ↔ 结构件 */
    var hangPairs = [];       /* 判据 C：非结构件挂在结构件上/下 */

    Object.keys(cells).forEach(function(k) {
      var c = cells[k], rc = k.split(','), r = +rc[0], col = +rc[1];
      var d = PARTS[c.part];
      if (d.inner) return;
      probe.push(c.part + '@' + k + (visible(r, col) ? '✓' : '✗'));

      [[0,1,'右'],[1,0,'下']].forEach(function(step) {
        var nk = (r + step[0]) + ',' + (col + step[1]);
        if (!cells[nk]) return;
        var nd = PARTS[cells[nk].part];
        if (nd.inner) return;
        var q = center(r + step[0], col + step[1]);
        var mine = center(r, col);
        var entry = { a: c.part + '@' + k, b: cells[nk].part + '@' + nk,
          aStruct: !!d.structure, bStruct: !!nd.structure, dir: step[2] };
        if (step[1] === 1) {
          var mx = (mine.x + q.x) / 2;
          entry.full = +coverage(mx, mine.y - PX*0.42, mx, mine.y + PX*0.42).toFixed(3);
          entry.br = bridge(mx, mine.y - PX*0.42, mx, mine.y + PX*0.42);
        } else {
          var my = (mine.y + q.y) / 2;
          entry.full = +coverage(mine.x - PX*0.42, my, mine.x + PX*0.42, my).toFixed(3);
          entry.br = bridge(mine.x - PX*0.42, my, mine.x + PX*0.42, my);
        }
        if (d.structure && nd.structure) structPairs.push(entry);
        else if (d.structure !== nd.structure) hangPairs.push(entry);
      });
    });
    return JSON.stringify({ nMask: nMask, PX: PX, probe: probe,
      structPairs: structPairs, hangPairs: hangPairs });
  })()`));

  A.log('自证（同状态两帧）差异像素：' + selfDiff +
    '，差分掩码 ' + res.nMask + ' 像素，格边长 ' + res.PX.toFixed(1) + ' 设计px');
  A.log('零件可见性探针（九点采样）：' + res.probe.join('  '));
  A.log('判据 B —— 结构件 ↔ 结构件（必须整条边焊满）：');
  res.structPairs.forEach(p => A.log('  ' + p.a.padEnd(18) + ' ↔ ' + p.b.padEnd(18) +
    p.dir + '  整条边 ' + (p.full * 100).toFixed(0) + '%'));
  A.log('判据 C —— 零件挂在结构件上（必须有一段连接件跨过接缝）：');
  res.hangPairs.forEach(p => A.log('  ' + p.a.padEnd(18) + ' ↔ ' + p.b.padEnd(18) +
    p.dir + '  整条边 ' + (p.full * 100).toFixed(0) + '%  连接段长 ' +
    (p.br.span * 100).toFixed(0) + '%  居中 ' + (p.br.centred ? '是' : '否')));

  const seenN = res.probe.filter(s => s.endsWith('✓')).length;
  A.chk('A 前提：量具能看见车（≥80% 的零件在九点采样下可见）',
    seenN >= Math.ceil(res.probe.length * 0.8),
    seenN + ' / ' + res.probe.length + ' 件');
  A.chk('A2 前提：车上有悬挂件对（否则下面那条判据什么都没量）',
    res.hangPairs.length >= 2, res.hangPairs.length + ' 对');

  /* 判据 B 被**删掉**了，原因记在这里：它曾经是"结构件之间的接缝不漏背景"，
   * 但实测它永远 100% —— 因为相邻两格的公共格线上必定有一条外描边
   * （`weldedEdges` 之后是共用的一条，没有焊接时是两条），
   * 而描边正好压在格线上。把木框的左右边框整段删掉，它仍然 100%。
   * 一个删掉被测代码还不红的判据，量的不是产品。
   *
   * "两个木框的两边粘连起来"这件事，真正的量具是 tools/test_weld.js ——
   * 它量的是**接缝那条墙有多厚**（改前 0.451 格 = 两条边，改后 0.250 = 一条），
   * 而且把焊接关掉就会红。这里不重复它，只保留它量不到的那一半：
   * 挂在车上的零件（气球/沙袋/轮子/风车桨）有没有一根连接件跨过接缝。 */

  const worstHang = res.hangPairs.reduce(
    (w, p) => (!w || (p.br.centred ? 1 : 0) < (w.br.centred ? 1 : 0) ||
      (p.br.span < w.br.span)) ? p : w, null);
  A.chk('B 每个悬挂件和它相邻的结构件之间都有一段连接件跨过接缝（居中且 ≥6%）',
    worstHang && worstHang.br.centred && worstHang.br.span >= 0.06,
    worstHang ? '最差 ' + worstHang.a + ' ↔ ' + worstHang.b + '：连接段 ' +
      (worstHang.br.span * 100).toFixed(0) + '%，' +
      (worstHang.br.centred ? '居中' : '不居中') : '无');

  /* 判据 C：**六关全扫一遍**，每关用**它自己的**标准解。
   *
   * ⚠ 这里踩过一次：`R.SPECS['1-4']` 和 `R.SPECS['1-5']` **不存在** ——
   * 那两关各有两种解法，key 是 `1-4i`/`1-4w`、`1-5n`/`1-5m`。
   * 用不存在的 key 取到 undefined，然后 `Object.keys(undefined)` 抛异常；
   * 异常被吞掉，扫描表里那两关就变成"无悬挂对"。
   * 而"无悬挂对"在报告里是**合法的**（1-1 真的没有），
   * 于是两关一个零件都没量，看起来却像通过。
   * 现在 SPEC_OF 是显式表：缺任何一关都会在 A3 断言上红。 */
  const SPEC_OF = {
    '1-1': '1-1', '1-2': '1-2', '1-3': '1-3',
    '1-4': '1-4w', '1-5': '1-5m', '1-6': '1-6'
  };
  A.log('六关扫描（每关现抓两帧求差，不复用别的关的基准图）：');
  const sweepBad = [];
  const sweptLevels = [];
  for (let li = 0; li < 6; li++) {
    const key = '1-' + (li + 1);
    const specKey = SPEC_OF[key];
    if (!specKey) { sweepBad.push(key + ' 没有指定标准解'); continue; }
    await ev(`(()=>{const R=window.__rap, S=R.state;
      const sp = R.RAP.SPECS[${JSON.stringify(specKey)}];
      if (!sp) return 'MISSING';
      R.startLevel(${li}); S.welcome=0; S.introT=1; S.phase='build'; S.run=null; S.runBanner=0;
      R.RAP.applySpec(R.level(), S.build, sp);
      return 1;})()`);
    const applied = await ev(`(()=>{const S=window.__rap.state;
      return Object.keys(S.build.cells).length;})()`);
    if (!applied) { sweepBad.push(key + ' 标准解没装上'); continue; }
    sweptLevels.push(key);
    await sleep(500);
    await ev(`(()=>{const cv=document.getElementById('cv'), g=cv.getContext('2d');
      window.__A = g.getImageData(0,0,cv.width,cv.height).data; return 1;})()`);
    await ev(`(()=>{const S=window.__rap.state;
      window.__sc = JSON.stringify(S.build.cells); window.__so = S.build.order.slice();
      S.build.cells = {}; S.build.order = []; return 1;})()`);
    await sleep(340);
    await ev(`(()=>{const cv=document.getElementById('cv'), g=cv.getContext('2d');
      window.__B = g.getImageData(0,0,cv.width,cv.height).data; return 1;})()`);
    await ev(`(()=>{const S=window.__rap.state;
      S.build.cells = JSON.parse(window.__sc); S.build.order = window.__so;
      return 1;})()`);
    await sleep(200);

    const one = JSON.parse(await ev(`(function(){
      var S=window.__rap.state, R=window.__rap, PARTS=R.RAP.PARTS;
      var cv=document.getElementById('cv'), v=window.__view;
      var K=cv.width/v.W, W=cv.width, H=cv.height;
      var A=window.__A, B=window.__B, o=R.buildOrigin(), PX=o.px;
      var mask=new Uint8Array(W*H);
      for(var i=0,p=0;i<A.length;i+=4,p++){
        var d=Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2]);
        if(d>24) mask[p]=1;
      }
      function cov(x,y){
        var dx=Math.round((x-v.offX)*K), dy=Math.round((y-v.offY)*K);
        if(dx<0||dx>=W||dy<0||dy>=H) return null;
        return mask[dy*W+dx]===1;
      }
      function bridge(x0,y0,x1,y1){
        var N=32, arr=[];
        for(var k=0;k<=N;k++){
          var t=k/N, c=cov(x0+(x1-x0)*t, y0+(y1-y0)*t);
          arr.push(c===null?0:(c?1:0));
        }
        var best=0, bestMid=0, run=0, start=0;
        for(var i2=0;i2<arr.length;i2++){
          if(arr[i2]){ if(run===0) start=i2; run++;
            if(run>best){ best=run; bestMid=(start+i2)/2; } } else run=0;
        }
        return { span:+(best/arr.length).toFixed(3),
          centred: best>=2 && Math.abs(bestMid-N/2)<=N*0.30 };
      }
      var cells=S.build.cells, hangs=[];
      Object.keys(cells).forEach(function(k){
        var c=cells[k], rc=k.split(','), r=+rc[0], col=+rc[1];
        var d=PARTS[c.part];
        if(d.inner) return;
        [[0,1],[1,0]].forEach(function(step){
          var nk=(r+step[0])+','+(col+step[1]);
          if(!cells[nk]) return;
          var nd=PARTS[cells[nk].part];
          if(nd.inner) return;
          if(d.structure===nd.structure) return;   /* 只关心悬挂件 */
          var cx1=o.x+col*PX+PX/2, cy1=o.y+r*PX+PX/2;
          var cx2=o.x+(col+step[1])*PX+PX/2, cy2=o.y+(r+step[0])*PX+PX/2;
          var br;
          if(step[1]===1){ var mx=(cx1+cx2)/2;
            br=bridge(mx, cy1-PX*0.42, mx, cy1+PX*0.42); }
          else { var my=(cy1+cy2)/2;
            br=bridge(cx1-PX*0.42, my, cx1+PX*0.42, my); }
          hangs.push({ a:c.part+'@'+k, b:cells[nk].part+'@'+nk, span:br.span,
            centred:br.centred });
        });
      });
      return JSON.stringify({ hangs: hangs });
    })()`));

    if (!one.hangs.length) {
      A.log('  ' + key + '：无悬挂对（这一关的车只有结构件与轮子）');
      continue;
    }
    const worst = one.hangs.reduce((w, p) =>
      (!w || (p.centred ? 1 : 0) < (w.centred ? 1 : 0) || p.span < w.span) ? p : w, null);
    const ok = worst.centred && worst.span >= 0.06;
    if (!ok) sweepBad.push(key + ' ' + worst.a + '↔' + worst.b +
      ' ' + (worst.span * 100).toFixed(0) + '%' + (worst.centred ? '' : ' 不居中'));
    A.log('  ' + key + '：' + one.hangs.length + ' 悬挂对，最差 ' +
      worst.a + '↔' + worst.b + ' 连接段 ' + (worst.span * 100).toFixed(0) + '%' +
      (worst.centred ? '' : '（不居中）') + (ok ? ' ✓' : ' ✗'));
  }
  A.chk('C 六关的悬挂件全部连在车上（每关最差的一对也要居中跨过接缝）',
    sweepBad.length === 0, sweepBad.length ? sweepBad.join('；') : '六关全过');
  A.chk('A3 前提：六关**每一关**都真的装上并扫过了（不是靠"无悬挂对"跳过）',
    sweptLevels.length === 6, sweptLevels.length + ' / 6 关：' + sweptLevels.join(' '));

  A.finish(ws, child);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

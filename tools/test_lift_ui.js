/* 气球 / 沙袋在**真浏览器**里的那条链路：看得见、点得着、点了有效果。
 *
 * 纯 Node 的 test_parts_lift.js 已经证明了规则本身对（tapAt / popBalloon / dropSandbag）。
 * 这里补的是它证明不了的三件事：
 *   1. 气球/沙袋的图元真的画在了车身该在的位置上（不是画成一团糊）；
 *   2. 堆叠徽标 ×3 真的出现了（1 个和 3 个在画面上必须能分辨）；
 *   3. 用**真实鼠标坐标**点车身，气球真的会少一个 —— 也就是说
 *      canvasPos → camLive → tapAt 这条换算没算错。
 *
 * 第 3 条是重点：坐标换算是"差半帧就点不中"的活儿，
 * 而 balloon 的判定半径只有 0.85 米（约 27 像素），写错一个符号就永远点不着。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const gridLib = require('./lib/grid');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeLU-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); };
  const click = async (x, y) => {
    const r = await ev(`(()=>{const c=document.querySelector('canvas').getBoundingClientRect();
      return JSON.stringify({x:c.left+${x}*c.width/1280, y:c.top+${y}*c.height/720});})()`);
    const p = JSON.parse(r);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(120);
  };

  // ---------- 建造期：托盘 ----------
  await ev(`(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; window.__rap.startLevel(5); s.welcome=0; s.introT=1; return 1;})()`);
  await sleep(600);
  const trayInfo = JSON.parse(await ev(`(()=>{const R=window.__rap;
    return JSON.stringify({ids:R.TRAY, rects:R.TRAY.map((_,i)=>R.trayRect(i))});})()`));
  const tray = trayInfo.rects, trayIds = trayInfo.ids;
  await shot('lu-01-build-tray');
  /* 托盘格数 = **本关零件箱**的件数 + 1（橡皮），不是零件总表。
   *
   * 这条断言的两次修订史正好是"假绿"的两种形状：
   *   第 63 轮：写死 `tray.length === 10`，零件从 9 涨到 13 之后当场红 ——
   *             功能正常，是量具在说谎（写死的数）。
   *   第 67 轮：改成 `TRAY_ORDER.length + 1`，看着"跟着数据走"了，
   *             其实同样是错的 —— 托盘从这一轮起只放**本关给的**零件，
   *             1-6 是 8 格而不是 14 格，于是它又红了一次。
   * 正确的参照物是 level().partsBox：这次从那一份现算。 */
  const expectTray = JSON.parse(await ev(`(()=>{
    const R=window.__rap, box=R.level().partsBox || {};
    return JSON.stringify(R.RAP.TRAY_ORDER.filter(p => (box[p]||0) > 0).concat(['eraser']));
  })()`));
  A.chk('托盘格数 = 本关零件箱件数 + 1（橡皮）',
    tray.length === expectTray.length && tray.length > 1,
    tray.length + ' 格，期望 ' + expectTray.length);
  A.chk('托盘内容 = 本关零件箱（本关不给的零件不出现）',
    JSON.stringify(trayIds) === JSON.stringify(expectTray),
    trayIds.join(',') + ' vs ' + expectTray.join(','));
  A.chk('托盘不超出 1280 宽',
    tray[0].x >= 8 && tray[tray.length - 1].x + tray[0].w <= 1272,
    `x ${Math.round(tray[0].x)} → ${Math.round(tray[tray.length - 1].x + tray[0].w)}`);
  const trayIdxOf = id => trayIds.indexOf(id);
  A.chk('托盘里能找到热气球和压舱石',
    trayIdxOf('balloon') >= 0 && trayIdxOf('sandbag') >= 0,
    'balloon@' + trayIdxOf('balloon') + ' sandbag@' + trayIdxOf('sandbag'));

  // ---------- 用真鼠标在建造期放 3 个气球（同格点 3 下 → ×3 徽标） ----------
  /* 目标格必须是**紧贴木框的上方一格**（第 3 行，木框在第 4 行）：
   * 气球不是结构件，`canPlace` 要求它挨着已有结构件，隔两行会被 'connect' 拒绝。
   * （这条是第一次跑红抓出来的 —— 当时点了 3 下，一个都没放上去。）
   *
   * ⚠ 格心必须**在放完木框之后**现读。第 64 轮世界锚定之后 buildOrigin() 是活的：
   * 放下第一个轮子时锚点跟着"车上最低轮子的下沿"抬起约 0.84 米
   * （1-6、zoom≈1.2 时实测 90 像素，正好一格多），
   * 原来把 o/BP 缓存在文件开头 → 三次连点全部落到 (5,3) 那个木轮上 →
   * 气球数量永远是 0，后面浮力读数与徽标探针全部连带失败。
   * 现在每次点击前用 tools/lib/grid.js 现读几何。 */
  const G = gridLib.make(ev, click);
  /* 托盘索引**按名字查**，不写死数字。
   * 旧代码写 `tray[6]`，那是旧零件表里气球的位置；新表里 6 是 propeller，
   * 于是"点托盘选中了气球"读到 selected=propeller —— 测试红，而托盘没错。 */
  await G.ensureSelected('balloon');
  A.chk('点托盘选中了热气球', (await ev('window.__rap.state.selected')) === 'balloon',
    'selected=' + (await ev('window.__rap.state.selected')));
  // 建造期格子需要先有木框；直接走 API 搭好基础车，再用鼠标补气球
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[5];
    for(const c of [1,2,3]) R.tryPlace(lv, s.build, 'wood_frame', 4, c);
    R.tryPlace(lv, s.build, 'wood_wheel', 5, 1);
    R.tryPlace(lv, s.build, 'wood_wheel', 5, 3);
    R.tryPlace(lv, s.build, 'pig', 4, 2);
    return 1;})()`);
  // API 造车把轮子放上去了 → 锚点刚动过，这里必须在**造车之后**读格心
  await G.clickCell(3, 3);
  await G.clickCell(3, 3);
  await G.clickCell(3, 3);
  const nBalloon = await ev(`window.__rap.RAP.cellCount(window.__rap.state.build.cells['3,3'])`);
  A.chk('鼠标连点同一格 3 次 → 叠了 3 个气球', nBalloon === 3, 'n=' + nBalloon);
  const liftLine = await ev('window.__rap.liftLineOf()');
  /* 浮力数值从**零件表**推：3 个球 × liftMass。
   * 旧断言写死 3.6（= 3 × 1.2），第 63 轮 liftMass 提到 3.2 之后
   * 实际是 9.6 —— 功能完全正常（HUD 写着「浮力 9.6　净重 -3.2 kg　会飘起来」），
   * 只是那个常量和零件表分叉了。 */
  {
    const lift1 = await ev('window.__rap.RAP.PARTS.balloon.liftMass');
    const want = (3 * lift1).toFixed(1);
    A.chk('建造 HUD 显示了浮力与净重',
      liftLine.indexOf('浮力 ' + want) >= 0 && /净重/.test(liftLine),
      liftLine + '（期望含「浮力 ' + want + '」）');
  }
  await shot('lu-02-build-stacked');

  // 徽标像素探针。
  /* 关键：**必须有对照组**。背景本身是深色建造区，跟"深色圆底"是同色的，
   * 所以"圆内比圆外暗"这种绝对判据根本立不住（第一次写的就是这个，永远红）。
   * 做法是在隔壁格放 **1 个**气球当对照 —— 两格的背景、零件、光照完全一样，
   * 唯一差别就是"有没有 ×3 徽标"。探针取的是同一个相对位置。 */
  await G.ensureSelected('balloon');   // 仍选着气球（幂等：已经是就不重点）
  await G.clickCell(3, 2);             // 只放 1 个
  {
    /* 徽标探针也现读几何 —— 采样点必须落在**现在**的那一格上。
     * 原来用文件开头缓存的 o/BP，锚点动过之后采样点已经偏了将近一格，
     * 采到的是隔壁格的背景，"有徽标 / 无徽标"两边自然一样。 */
    const g = await G.geo();
    const badgeAt = (col, row) => ({
      x: g.x + col * g.px + 0.80 * g.px,
      y: g.y + row * g.px + 0.80 * g.px
    });
    const P3 = badgeAt(3, 3), P1 = badgeAt(2, 3);   // 3 个的那格 / 1 个的对照格
    A.chk('对照格（3,2）确实只有 1 个气球',
      (await ev(`window.__rap.RAP.cellCount(window.__rap.state.build.cells['3,2'])`)) === 1, '1 个');
    const sample = async (p) => JSON.parse(await ev(`(()=>{
      const cv=document.getElementById('cv'),g=cv.getContext('2d');
      const sx=cv.width/1280, sy=cv.height/720;
      const cx=Math.round(${p.x}*sx), cy=Math.round(${p.y}*sy);
      const R=14, d=g.getImageData(cx-R, cy-R, R*2+1, R*2+1).data;
      let deep=0, warm=0, bright=0;
      for(let i=0;i<d.length;i+=4){
        const r=d[i],gg=d[i+1],b=d[i+2], lum=(r+gg+b)/3;
        if(lum<48) deep++;
        if(r>190 && gg>158 && b<212) warm++;
        if(lum>170) bright++;
      }
      return JSON.stringify({deep, warm, bright});})()`));
    const withBadge = await sample(P3);
    const noBadge = await sample(P1);
    A.chk('×3 徽标画出来了（同背景下，有徽标的格多出深色圆底）',
      withBadge.deep > noBadge.deep + 40,
      `叠 3 个那格 ${withBadge.deep} 暗像素 vs 只放 1 个那格 ${noBadge.deep}`);
    /* 徽标判据：**暖金圆环**是它唯一的专属信号（drawStackBadge 的
     * strokeStyle = rgba(232,200,122,.85)，一个整圈描边）。
     *
     * 为什么不再断言"亮色数字变多"：叠 3 个气球的那格，气球本身画得
     * 比只放 1 个的那格**更密**，把采样窗口里的大片亮色盖掉了 ——
     * 实测亮色反而从 221 掉到 90。那条断言量的是"这格亮不亮"，
     * 不是"有没有徽标"，在新美术下会稳定误报。
     * 暖色像素才是徽标独有的（气球是粉 #e0708f，不含 r>190&g>158 的暖金）。 */
    A.chk('徽标上有暖金圆环（叠满格比对照格明显多出暖金像素）',
      withBadge.warm > noBadge.warm + 15,
      `暖色 ${noBadge.warm}→${withBadge.warm}`);
  }

  // ---------- 行驶期：点车身扎气球 ----------
  /* 用 1-6 的官方规格发射（6 气球 + 3 沙袋），这样气球和沙袋都在车上。
   * 注意**不能先暂停再点** —— 暂停分支会把所有点击吞掉（那是刻意的防误触），
   * 于是"点不动"会被误读成"坐标算错了"。这里就在跑动中点，
   * 反正 tapAt 用的是点下去那一瞬间的车位。 */
  /* 用 launchSpec（正确入口）而不是 applySpec + launch。
   *
   * 第 63 轮重写零件表之后，1-6 的标准解里多了 anemo_core / propeller，
   * 而 `applySpec` 只负责摆位 —— 它不建 run、不写 actScript。
   * 旧写法在这一步之后 `state.run` 里没有气球（car.parts 找不到 liftMass），
   * 于是 `bp.lx` 对 undefined 取值，脚本直接崩：
   *   TypeError: Cannot read properties of undefined (reading 'lx')
   * 崩溃连一条断言都跑不到。launchSpec 会走 launch()，车和 run 一起建好。 */
  await ev(`(()=>{const s=window.__rap.state;
    s.welcome=0; s.introT=1; s.paused=false;
    window.__rap.launchSpec(5, '1-6');
    s.runBanner=0; s.paused=false; return 1;})()`);
  await sleep(400);
  /* 前提断言：车的**真的**带着气球，否则后面那串读数全是 undefined。 */
  const pre = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
    const car = s.run && s.run.car;
    if (!car) return JSON.stringify({ok:false, why:'no run'});
    return JSON.stringify({ok:true,
      hasBalloon: car.parts.some(p=>p.def.liftMass),
      hasBag: car.parts.some(p=>p.def.dropOne),
      lift: car.liftMass, n: car.parts.length});})()`));
  A.chk('前提：1-6 的车上有气球也有沙袋（否则后面的读数没有意义）',
    pre.ok && pre.hasBalloon && pre.hasBag, JSON.stringify(pre));
  if (!pre.ok || !pre.hasBalloon) { A.finish(ws, child); return; }
  const before = JSON.parse(await ev(`(()=>{const s=window.__rap.state.run;
    return JSON.stringify({lift:s.car.liftMass, pops:s.balloonPops||0,
      bags:s.car.sandbagCount||0, mass:s.car.mass});})()`));
  A.chk('发射后车上带着气球和沙袋', before.lift > 0 && before.bags > 0,
    `lift=${before.lift.toFixed(2)} bags=${before.bags}`);

  // 用 camLive 反算车身气球的屏幕坐标 —— 和渲染层用的是同一个镜头
  const scr = JSON.parse(await ev(`(()=>{const s=window.__rap.state, cm=s.camLive, car=s.run.car;
    const bp=car.parts.find(p=>p.def.liftMass);
    const ca=Math.cos(car.a), sa=Math.sin(car.a);
    const wx=car.x+bp.lx*ca-bp.ly*sa, wy=car.y+bp.lx*sa+bp.ly*ca;
    const z=32*cm.zoom;
    return JSON.stringify({x:1280/2+(wx-cm.x)*z, y:720/2-(wy-cm.y)*z, wx, wy,
      cam:{x:cm.x,y:cm.y,zoom:cm.zoom}});})()`));
  A.log('气球在屏幕 (' + Math.round(scr.x) + ',' + Math.round(scr.y) + ')');
  await click(scr.x, scr.y);
  const after = JSON.parse(await ev(`(()=>{const s=window.__rap.state.run;
    return JSON.stringify({lift:s.car.liftMass, pops:s.balloonPops||0});})()`));
  A.chk('用真实鼠标点车身 → 扎破一个气球', after.pops === before.pops + 1,
    `pops ${before.pops} → ${after.pops}（指针 ${Math.round(scr.x)},${Math.round(scr.y)}）`);
  /* 下降量 = **一个气球**的 liftMass（从零件表现取，不写死 1.2）。 */
  {
    const lift1 = await ev('window.__rap.RAP.PARTS.balloon.liftMass');
    A.chk('扎破后浮力下降 ' + lift1 + ' kg',
      Math.abs((before.lift - after.lift) - lift1) < 1e-6,
      `${before.lift.toFixed(2)} → ${after.lift.toFixed(2)}`);
  }

  /* 炸开的橡皮屑必须真的出现了。
   * 没有这条，"点气球只有数字变、画面上什么都不发生"这种回归永远抓不到 ——
   * 而玩家的第一反应会是"我没点中"。
   * `burst` 事件是物理层写在事件层里的，渲染层消费它会 spawnBurstFx。 */
  {
    const nBurst = await ev('(window.__rap.state.bursts||[]).length');
    A.chk('扎破时有爆炸粒子（不是只有数字变了）', nBurst >= 8, nBurst + ' 个粒子');
    // 粒子必须会漂走并消失，不能永久堆在 state 里
    await sleep(1200);
    const nBurst2 = await ev('(window.__rap.state.bursts||[]).length');
    A.chk('爆炸粒子会自己消失（不会一直堆在 state 里）', nBurst2 < nBurst, `${nBurst} → ${nBurst2}`);
  }

  // 反向对照：点在**远离任何可点零件**的地方，不该有任何副作用
  {
    /* ⚠ 必须先关掉这局的**自动动作脚本**。
     *
     * 这一局是 launchSpec(5,'1-6') 发的，而 1-6 的标准解带
     * `_drops: [{t:1.5, n:2}]` —— 出发 1.5 秒后**自动**扔掉两个压舱石。
     * 上一段（点气球 + 等 1.2 秒看粒子消失）早就跑过 1.5 秒了，
     * 于是这里是这样的读数：
     *     点之前 bags=0  →  点之后 bags=2
     * 看起来像"点远处扔了两个沙袋"，其实是脚本自动扔的，
     * 只是恰好落在这个窗口里。测的是**别人的动作**，不是这次点击。
     *
     * 两件事都要做：
     *   1. 清空 actScript，别让脚本的动作混进这个观测窗口；
     *   2. 等一下，确保窗口里再没有任何未完成的动作。
     */
    await ev('window.__rap.state.run.actScript = []');
    await sleep(300);
    const b2 = JSON.parse(await ev(`(()=>{const s=window.__rap.state.run;
      return JSON.stringify({pops:s.balloonPops||0, bags:s.sandbagsDropped||0});})()`));
    /* 反观点也不能写死"车外 220px"：那个偏移是为了躲开气球，
     * 但同一辆车上还有沙袋。220px 换算成世界坐标够不够远，
     * 取决于当时的 zoom 和车的姿态 —— 实测某些帧上正好落进沙袋的 0.85 米判定圈。
     * 正确做法：**问引擎**哪个点离所有可点零件都最远。 */
    const far = JSON.parse(await ev(`(()=>{
      const S=window.__rap.state, car=S.run.car;
      const cm=S.camLive, z=32*cm.zoom;
      const ca=Math.cos(car.a), sa=Math.sin(car.a);
      const tap=[];
      car.parts.forEach(p => {
        if (!p.def.stack && !p.def.oneShot) return;
        const wx=car.x+p.lx*ca-p.ly*sa, wy=car.y+p.lx*sa+p.ly*ca;
        tap.push({x:wx, y:wy});
      });
      if (!tap.length) return JSON.stringify({err:'no tappable part'});
      let best=null, bestD=-1;
      for (let ang=0; ang<Math.PI*2; ang+=Math.PI/12) {
        const wx = car.x + Math.cos(ang)*4.5, wy = car.y + Math.sin(ang)*4.5;
        let dmin = 1e9;
        tap.forEach(t => { dmin = Math.min(dmin, Math.hypot(t.x-wx, t.y-wy)); });
        if (dmin > bestD) { bestD = dmin; best = {x:wx, y:wy}; }
      }
      return JSON.stringify({
        sx: 1280/2 + (best.x-cm.x)*z, sy: 720/2 - (best.y-cm.y)*z,
        minDistM: +bestD.toFixed(2), nTap: tap.length });
    })()`));
    A.chk('前提：找到了一个离所有可点零件都很远的点（>2 米）',
      !far.err && far.minDistM > 2.0, JSON.stringify(far));
    await click(far.sx, far.sy);
    const a2 = JSON.parse(await ev(`(()=>{const s=window.__rap.state.run;
      return JSON.stringify({pops:s.balloonPops||0, bags:s.sandbagsDropped||0});})()`));
    A.chk('点车身外面不误触', a2.pops === b2.pops && a2.bags === b2.bags,
      `pops ${b2.pops}→${a2.pops} bags ${b2.bags}→${a2.bags}` +
      `（点在离最近可点件 ${far.minDistM} 米处，屏幕 ${Math.round(far.sx)},${Math.round(far.sy)}）`);
  }
  await shot('lu-03-run-after-pop');

  // ---------- 点沙袋：扔一个 ----------
  /* ⚠ 必须**重新发一次车**。
   *
   * 1-6 的标准解里 `_drops: [{t:1.5, n:2}]` —— 出发 1.5 秒后两个压舱石
   * 就自动扔掉了（那是标准解写好的动作，走的是 dropSandbag 同一条路径）。
   * 而这一段跑在点完气球之后，那时早就过了 1.5 秒，
   * 车上 `sandbagCount` 已经是 0 → 找不到 `p.def.dropOne` 的零件 →
   * 第一版报「点沙袋 → 扔下去一个 车上没有沙袋」。
   *
   * 所以要验"点车身能扔沙袋"，得先有一个**还带着沙袋**的在跑的车：
   * 用一份把 `_drops` 去掉的 spec 重新发射。 */
  await ev(`(()=>{const s=window.__rap.state, R=window.__rap.RAP;
    window.__rap.startLevel(5); s.welcome=0; s.introT=1;
    const spec = JSON.parse(JSON.stringify(R.SPECS['1-6']));
    delete spec._drops;                    // 不自动扔，留给鼠标点
    delete spec._pops;
    R.applySpec(window.__rap.levels[5], s.build, spec);
    s.phase='build'; s.run=null;
    window.__rap.launch(); s.runBanner=0; return 1;})()`);
  await sleep(600);
  {
    const pre = JSON.parse(await ev(`(()=>{const c=window.__rap.state.run.car;
      return JSON.stringify({bags:c.sandbagCount||0});})()`));
    A.chk('前提：这一局车上确实还带着压舱石', pre.bags > 0, 'bags=' + pre.bags);
    const sb = JSON.parse(await ev(`(()=>{const s=window.__rap.state, cm=s.camLive, car=s.run.car;
      const bp=car.parts.find(p=>p.def.dropOne && (p.n||0) > 0);
      if(!bp) return JSON.stringify({none:true});
      const ca=Math.cos(car.a), sa=Math.sin(car.a);
      const wx=car.x+bp.lx*ca-bp.ly*sa, wy=car.y+bp.lx*sa+bp.ly*ca;
      const z=32*cm.zoom;
      return JSON.stringify({x:1280/2+(wx-cm.x)*z, y:720/2-(wy-cm.y)*z});})()`));
    if (!sb.none) {
      const d0 = await ev('window.__rap.state.run.car.sandbagCount');
      await click(sb.x, sb.y);
      await sleep(150);
      const d1 = await ev('window.__rap.state.run.car.sandbagCount');
      A.chk('点沙袋 → 扔下去一个', d1 === d0 - 1, `${d0} → ${d1}`);
    } else {
      A.chk('点沙袋 → 扔下去一个', false, '车上没有沙袋（1-6 规格里应该有）');
    }
  }

  // ---------- 三星条件条：1-6 是「沙袋全扔」，必须显示 已扔 n / 总数 ----------
  {
    const cs0 = JSON.parse(await ev(`JSON.stringify(window.__rap.challengeStatus(window.__rap.state.run))`));
    /* 名字从**零件表**推（`PARTS.sandbag.label`），不写死「沙袋」。
     * 第 63 轮把零件改名成「压舱石」，所有写死「沙袋全扔」的断言都会红，
     * 而三处显示其实完全一致。 */
    const bagLabel2 = await ev('window.__rap.RAP.PARTS.sandbag.label');
    A.chk('1-6 的三星条是「' + bagLabel2 + '全扔」',
      cs0.label === bagLabel2 + '全扔', cs0.label);
    A.chk('三星条显示 已扔 / 总数（而不是只有一个数字）',
      /\/\s*\d+/.test(cs0.value), cs0.value);
    /* 总数必须等于**这一局的 spec 实际堆了几个**，不是写死的 3。
     * 第 63 轮 1-6 的 _stacks.sandbag 从 3 改成 2（车变重了，3 个压舱石
     * 会让它飞不起来），于是 `=== 3` 这条红了 —— 而记账本身是对的。
     * 现在从 spec 现推期望值，两边只有一个来源。 */
    A.chk('总数来自出发那一刻的记账（不是现算 build）',
      (await ev('window.__rap.state.run.sandbagTotal')) ===
      (await ev(`window.__rap.RAP.SPECS['1-6']._stacks.sandbag`)),
      'sandbagTotal=' + (await ev('window.__rap.state.run.sandbagTotal')));
    // 把剩下两个也扔完 → 条件必须变成满足
    /* `dropSandbag(st)` 每次**只扔一个**（它返回是否扔成功了）。
     * 第一版写 `while(RAP.dropSandbag(s));` —— 那会一直扔到没有为止，
     * 但中途 state 里的会计（sandbagsDropped）是 RAP.step 里累加的，
     * 而这里没有推进物理，所以读到的永远停在"已扔 1"。
     * 正确的做法：按 spec 里的总数逐个扔，并在每次之后读一次计数。 */
    await ev(`(()=>{const R=window.__rap, s=window.__rap.state.run;
      const total = s.sandbagTotal || 0;
      for (let k = 0; k < total + 2; k++) {
        if (!R.RAP.dropSandbag(s, 1)) break;
      }
      return 1;})()`);
    await sleep(150);
    const cs1 = JSON.parse(await ev(`JSON.stringify(window.__rap.challengeStatus(window.__rap.state.run))`));
    A.chk('扔完之后三星条变成满足（3/3 必须给星，不能差一个数）', cs1.pass === true,
      'pass=' + cs1.pass + '  ' + cs1.value);
  }

  // ---------- 第三颗星的名字：三处显示必须是同一份 ----------
  /* 之前是"结算页 / 行驶状态条 / 选关卡面"各写一份手抄表，
   * 加气球/沙袋那两颗新星时只改了两处，选关卡面就会显示 "★★★：—"。
   * 这里把三处的值都取出来对比。 */
  {
    const three = JSON.parse(await ev(`(()=>{const R=window.__rap, lv=R.levels[5];
      return JSON.stringify({
        card: R.challengeNameOf(lv),
        result: R.goalNames().challenge,
        bar: R.challengeStatus(R.state.run || {}).label
      });})()`));
    A.chk('选关卡面 / 结算页 / 状态条 三处的第三颗星名字一致',
      three.card === three.result && three.card === three.bar,
      `卡面「${three.card}」结算「${three.result}」状态条「${three.bar}」`);
    A.chk('三处都不是占位符（"—" / 空 / 原始 type）',
      !/^(—|)$/.test(three.card) && !/allSandbags/.test(three.card), three.card);
  }

  // ---------- 「飞过终点但没落地」必须有实时提示 ----------
  /* 这条需求是量出来的，不是想出来的：probe_over_goal.js 显示标准解
   * 在 t=9.47 就越过终点线、但车还在 15 米高空，到 12.53 才落回地面判赢。
   * 中间 3 秒玩家看到的是"我已经飞过旗子了，怎么没赢？"——
   * 必须给一个读数，而且它要**随高度消失**（不能是一次性 toast，
   * 否则每一局正常通关都会先弹一条警告）。 */
  {
    const rows = JSON.parse(await ev(`(()=>{const R=window.__rap, st=window.__rap.state.run, lv=window.__rap.levels[5];
      const out=[];
      const base={car:{x:lv.goal.col+1,y:0},terrain:st.terrain};
      const surf=st.terrain.surfaceY(lv.goal.col+1);
      out.push(['远高于终点', R.overGoalNotice({car:{x:lv.goal.col+1,y:surf+8},terrain:st.terrain})]);
      out.push(['贴着地面',   R.overGoalNotice({car:{x:lv.goal.col+1,y:surf+1.5},terrain:st.terrain})]);
      out.push(['还没到终点', R.overGoalNotice({car:{x:lv.goal.col-3,y:surf+8},terrain:st.terrain})]);
      return JSON.stringify({rows:out, surf});})()`));
    A.chk('飞在终点上空 8 米 → 提示"落回地面才算到"',
      !!rows.rows[0][1] && /落回地面/.test(rows.rows[0][1].text), JSON.stringify(rows.rows[0][1]));
    A.chk('落回终点地面（1.5 米）→ 提示消失（赢的那一局不该有警告）',
      rows.rows[1][1] === null, String(rows.rows[1][1]));
    A.chk('还没到终点 → 不提这条', rows.rows[2][1] === null, String(rows.rows[2][1]));
  }

  // ---------- 失败文案：flew_away 必须有中文，不能落到 key 上 ----------
  await ev(`(()=>{const s=window.__rap.state; s.phase='run';
    s.run.result='fail'; s.run.failReason='flew_away'; s.run.phase='resolved';
    s.phase='resolved'; s.resultBtnY=556; return 1;})()`);
  await sleep(400);
  const txt = await ev(`(()=>{const s=window.__rap.state;
    return window.__rap.state.phase;})()`);
  A.chk('flew_away 能让结算页正常显示（不抛异常）', txt === 'resolved', 'phase=' + txt);
  await shot('lu-04-result-flew-away');

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

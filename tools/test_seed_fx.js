/* 种子的三种效果在**画面上**真的出现了吗（第 71 轮）。
 *
 * 引擎里的断言在 tools/test_seeds.js。这一支只问一件事：**玩家能不能看见**。
 * 三种效果都是"看不见的物理"—— 风场是力、岩柱改的是 groundY、
 * 雷屏障挡的是一条判定线。只在引擎里生效的话，玩家看到的是
 * "我按了 F，车莫名其妙飞起来了"，那不是机制，是 bug 的观感。
 *
 * ── 判据：**同一块区域的前后差分** ──
 *
 * 第一版用"颜色辨识"（青色占比 / 暖砂占比 / 紫色占比）判，全部读 0%。
 * 原因是三个效果都是**半透明**的：风场是 rgba(180,255,238,0.26)，
 * 叠在洞穴的深青背景上出来是 rgb(62,100,91) —— 既不"青"也不"亮"，
 * 按绝对色相找根本找不到。
 *
 * 现在改成：同一块区域抓两帧（触发前 / 触发后），数**变化了的像素**。
 * 这对任何配色都成立，而且自带反向对照（没画东西 → 差异 0）。
 *
 * ⚠ 坐标必须用 `state.camLastDraw`（这一帧渲染真正用的镜头），
 * 不能用 `state.camLive`（上一帧末尾写的，还带着震屏抖动）。
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
  const PORT = 9640 + Math.floor(Math.random() * 60);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeSeedFx-' + Date.now()),
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
  const errs = [];
  ws.addEventListener('message', ev2 => {
    try {
      const m = JSON.parse(ev2.data);
      if (m.method === 'Runtime.exceptionThrown') {
        errs.push(m.params.exceptionDetails.text + ' ' +
          (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || ''));
      } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        /* ⚠ Error 对象没有 `.value`，只有 `.description`。
         * 原来写 `a.value`，于是渲染异常整条记录变成空字符串 ——
         * `errors:` 后面一串空白，看起来像"没有异常"，其实每一帧都在抛。 */
        errs.push(m.params.args.map(a =>
          a.description || (a.value !== undefined ? String(a.value) : a.type)).join(' '));
      }
    } catch (e) {}
  });

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  /* 起一局：1-3 的车 + 三颗种子 + 伞。工程上两件事必须做：
   *   1. **放开 partsBox** —— 1-3 只给风车桨的预算，不给岩/雷/伞；
   *   2. 车冻住（`vx=0` 且每帧回写），否则它会自己滚出采样区。 */
  const setup = async (withBarrier) => {
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(2); S.welcome=0; S.introT=1; S.phase='build'; S.run=null; S.runBanner=0;
      Object.keys(R.RAP.PARTS).forEach(id => { R.level().partsBox[id] = 5; });
      R.RAP.applySpec(R.level(), S.build, {
        wood_frame: [[4,1],[4,2],[4,3]], wood_wheel: [[5,1],[5,3]],
        pig: [[4,2]], anemo_core: [[4,1]], geo_core: [[4,3]],
        electro_core: [[3,1]], umbrella: [[3,2]] });
      S.phase='build'; S.run=null;
      R.launch(); S.runBanner=0;
      S.run.car.vx = 0; S.run.car.vy = 0; S.run.car.w = 0;
      /* ⚠ **不要装风车桨**。第一版装了，于是驱动件每帧都在吐风特效
       * （spawnWindFx），那 14 条流线一直在动 —— 区域差分里
       * 68% 全是它们，和"风场有没有画出来"毫无关系。
       * 反向验证抓到的：把 drawWindField 早退掉，A 那条断言照样通过。
       * 判据区域里只能有**被测的那一个变量**在动。 */
      S.windFx = []; S.windAcc = 0; S.dust = []; S.bursts = []; S.debris = [];
      S.run.barriers = ${withBarrier} ? [{ col: Math.round(S.run.car.x) + 4, h: 4 }] : [];
      /* 把车**钉死在原地**：每帧把位置和速度一起写回去。
       *
       * ⚠ 只清零速度是不够的 —— 风场的升力在两次清零之间依然会把车
       * 抬起来一段。实测：只清速度时，"触发风种 → 像素差异 68%" 里有
       * 相当一部分是**车挪了位置**，不是风场被画出来。
       * 这条是被反向验证抓到的：把 drawWindField 整个早退掉，
       * A 那条断言仍然通过（差异还很大，因为车还在飘）。
       * 钉住位置之后，画面有差异就只能是"画上去的东西"。
       * （模板字符串里不能出现反引号，所以这里用函数名不用代码标记。） */
      if (!window.__pinCar) {
        window.__pinCar = setInterval(() => {
          const S = window.__rap.state;
          const c = S.run && S.run.car;
          if (!c || !c.__frozen) return;
          c.vx = 0; c.vy = 0; c.w = 0;
          if (c.__pinX !== undefined) { c.x = c.__pinX; c.y = c.__pinY; c.a = c.__pinA || 0; }
        }, 8);
      }
      return 1;})()`);
    await sleep(1100);
    /* 镜头稳定之后才锁车（否则镜头还在缓动，两帧之间地形会平移）。
     * ⚠ 模板字符串里不能出现反引号，所以这一段用 ev 的字符串形式。 */
    await ev('(()=>{const c=window.__rap.state.run.car;' +
      'c.__pinX=c.x; c.__pinY=c.y; c.__pinA=c.a; c.__frozen=true; return 1;})()');
    await sleep(600);
  };

  /* 等画面**真正静止**再采样，而且**把镜头钉死**。
   *
   * ⚠ 这一条是被反向验证逼出来的。实测把 drawPillars 整个早退掉，
   * B 那条"柱身区域差异 ≥15%"仍然报 84% —— 差异和柱子毫无关系。
   * 两层原因：
   *   1. `camState.zoom` 是**指数收敛**的，收敛很慢（0.6 秒内还差 3.7%）；
   *   2. 岩柱把 groundY 抬到柱顶之后，车的落点、镜头的目标全都变了，
   *      镜头会**一直**朝新目标爬 —— "等它自己停"等不到。
   * 所以不靠等，直接**把 camState 钉死**：`__lockCam` 打开后每帧回写
   * 同一个 {x, y, zoom}。这样两次采样之间唯一的变量就是被测的效果。
   * （`state.camLastDraw` 仍然每帧更新，所以采样坐标依然准。） */
  const lockCam = async (wx, wy, zoom) => {
    await ev('(()=>{const S=window.__rap.state;' +
      'S.__lockCam = { x: ' + wx + ', y: ' + wy + ', zoom: ' + zoom + ' };' +
      'S.camState.x = ' + wx + '; S.camState.y = ' + wy + '; S.camState.zoom = ' + zoom + ';' +
      'return 1;})()');
    await sleep(260);
  };

  const waitStable = async (wx, wy, half, maxMs) => {
    let prev = await grabWorld(wx, wy, half);
    const t0 = Date.now();
    for (let i = 0; i < 40; i++) {
      await sleep(120);
      const cur = await grabWorld(wx, wy, half);
      const d = diffPct(prev, cur);
      if (d === 0) return { ok: true, waited: Date.now() - t0, diff: d };
      prev = cur;
      if (Date.now() - t0 > (maxMs || 6000)) break;
    }
    return { ok: false, waited: Date.now() - t0 };
  };

  /* 以**这一帧真正用的镜头**反算世界 → 设计坐标 */
  const worldToDesign = async (wx, wy) => JSON.parse(await ev(`(()=>{
    const S=window.__rap.state, cm=S.camLastDraw || S.camLive, s=32*cm.zoom;
    return JSON.stringify({ x: 640 + ((${wx}) - cm.x)*s, y: 360 - ((${wy}) - cm.y)*s,
      zoom: cm.zoom });})()`));

  /* 抓一块区域，**按世界坐标**。
   *
   * ⚠ 这是本测试最关键的一处修正。原来接受的是"设计坐标"，
   * 于是调用方在触发前算好一次 `p`，触发后再用同一个 `p` 采样 ——
   * 但镜头是**跟着车走的**：岩柱把车托高 2 米，镜头也升 2 米，
   * 同一个设计坐标就指到了另一个世界位置。结果"柱身区域差异 95%"里
   * 绝大部分是**整个画面在平移**，不是柱子被画出来。
   * 反向验证抓到的：把 drawPillars 早退掉，B 那条断言照样通过。
   *
   * 现在每次采样都**现算**世界 → 设计坐标，镜头怎么动都不影响判定区域。 */
  const grabWorld = async (wx, wy, half) => JSON.parse(await ev(`(()=>{
    const cv=document.getElementById('cv'), g=cv.getContext('2d'), v=window.__view;
    const S=window.__rap.state, cm=S.camLastDraw || S.camLive, s=32*cm.zoom;
    const k = cv.width / v.W;
    const cx = 640 + ((${wx}) - cm.x)*s;
    const cy = 360 - ((${wy}) - cm.y)*s;
    /* ⚠ 尺寸必须**恒定**，所以夹的是**起点**而不是终点。
     * 第一版写 x1 = min(cv.width, cx+half) —— 靠近画布边缘时
     * 那个 min 会把宽度削掉，两次采样的 w/h 不同，diffPct 直接返回 -1，
     * 于是差异显示成 "-1%"（谁也没想到那是"尺寸不匹配"的哨兵值）。
     * 现在先把起点夹进合法范围，尺寸就永远是 2*half。
     * （模板字符串里不能出现反引号，所以这里不用代码标记。） */
    const side = Math.max(4, Math.round(${half}*2*k));
    const x0 = Math.max(0, Math.min(cv.width - side, Math.round((cx - ${half} - v.offX)*k)));
    const y0 = Math.max(0, Math.min(cv.height - side, Math.round((cy - ${half} - v.offY)*k)));
    const w = side, h = side;
    const d = g.getImageData(x0, y0, w, h).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) out.push((d[i]<<16)|(d[i+1]<<8)|d[i+2]);
    return JSON.stringify({ w, h, px: out, cx: +cx.toFixed(1), cy: +cy.toFixed(1) });})()`));

  /* 抓一块区域（设计坐标 + 半边长），返回采样数组 */
  const grab = async (cx, cy, half) => JSON.parse(await ev(`(()=>{
    const cv=document.getElementById('cv'), g=cv.getContext('2d'), v=window.__view;
    const k = cv.width / v.W;
    const x0 = Math.max(0, Math.round((${cx} - ${half} - v.offX)*k));
    const y0 = Math.max(0, Math.round((${cy} - ${half} - v.offY)*k));
    const x1 = Math.min(cv.width, Math.round((${cx} + ${half} - v.offX)*k));
    const y1 = Math.min(cv.height, Math.round((${cy} + ${half} - v.offY)*k));
    const w = Math.max(1, x1-x0), h = Math.max(1, y1-y0);
    const d = g.getImageData(x0, y0, w, h).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) out.push((d[i]<<16)|(d[i+1]<<8)|d[i+2]);
    return JSON.stringify({ w, h, px: out });})()`));

  const diffPct = (a, b) => {
    if (a.w !== b.w || a.h !== b.h) return -1;
    let n = 0;
    for (let i = 0; i < a.px.length; i++) {
      const p = a.px[i], q = b.px[i];
      const dr = Math.abs(((p >> 16) & 255) - ((q >> 16) & 255));
      const dg = Math.abs(((p >> 8) & 255) - ((q >> 8) & 255));
      const db = Math.abs((p & 255) - (q & 255));
      if (dr + dg + db > 20) n++;
    }
    return +(n / Math.max(1, a.px.length) * 100).toFixed(1);
  };

  /* ── 风场 ── */
  await setup(false);
  {
    const car = JSON.parse(await ev('JSON.stringify({x: window.__rap.state.run.car.x, ' +
      'y: window.__rap.state.run.car.y})'));
    /* ⚠ 采样区必须**避开车身**。
     *
     * 第一版采在车心，于是"触发风种 → 差异 68%"里混进了两件事：
     * 风场被画出来，以及车被托起来之后**位置变了**。
     * 反向验证抓到的：把 drawWindField 早退掉，A 那条断言照样通过。
     * 现在取车右侧 4.5 米（仍在 6 米半径内，但车不在那里）——
     * 那一片只有风场会画东西。 */
    const p = await worldToDesign(car.x + 4.2, car.y - 0.4);
    const before = await grab(p.x, p.y, 70);
    const self = await grab(p.x, p.y, 70);
    A.log('风场：静止两帧自身差异 ' + diffPct(before, self) + '%');
    await ev('window.__rap.triggerSeed("anemo")');
    await sleep(420);
    const after = await grab(p.x, p.y, 70);
    const d = diffPct(before, after);
    A.log('触发风种后（车旁 4.2 米处）：差异 ' + d + '%');
    A.chk('A 触发风种后画面上出现风场（车旁区域内像素差异 ≥ 8%）', d >= 8, d + '%');
    A.chk('A2 前提：风场真的在引擎里', await ev('!!window.__rap.state.run.windField'),
      'windField 存在');
    A.chk('A3 风场是范围性的（半径 6 米，覆盖车周围 3 格以上）',
      (await ev('window.__rap.state.run.windField.r')) >= 4,
      'r=' + (await ev('window.__rap.state.run.windField.r')));

    /* 反向对照：清掉风场。这一片的背景是静止的，车也不在这里，
     * 所以"擦不擦得掉"能干净地量出来。 */
    await ev('window.__rap.state.run.windField = null;');
    await sleep(420);
    const gone = await grab(p.x, p.y, 70);
    const back = diffPct(before, gone);
    A.log('清掉风场后：与初始差异 ' + back + '%（风场在时 ' + d + '%）');
    A.chk('A4 风场消失后画面回到原样（不是画上就擦不掉）', back < d * 0.6,
      back + '% < ' + d + '%');
  }

  /* ── 岩柱：把它挪到离车 8 米再测绘制 ──
   *
   * ⚠ 这一组改了六遍，前五遍都是同一个毛病：采样区里同时有车和柱子。
   * 柱子会改 groundY → 车被托起来 → 采样区的差异里混进"车动了"。
   * 反向验证每次都抓到（把 drawPillars 早退掉，B 照样报 29%~45%）。
   *
   * 现在这一支只回答"柱子有没有被画出来"，所以：
   *   · 不触发岩种，直接往场景里塞一根离车 8 米的柱子；
   *   · 镜头也挪到柱子那边，采样区里只有柱子和地面。
   * "车真的被托高了"归 tools/test_seeds.js 的 C4 管（引擎断言）。
   * 分工清楚之后，删掉绘制必然读到 0%。 */
  await setup(false);
  {
    const car = JSON.parse(await ev('(()=>{const S=window.__rap.state;' +
      'const c=S.run.car, cm=S.camLastDraw||S.camLive;' +
      'return JSON.stringify({x: c.x, y: c.y, gy: S.run.terrain.surfaceY(c.x)});})()'));
    const px = car.x + 8;
    const pgy = await ev('window.__rap.RAP.groundY(window.__rap.state.run,' + px + ')');
    const sy = pgy + 1.2;                      // 柱身中段
    await lockCam(px - 1.5, sy + 1.0, 1.85);
    await sleep(320);

    const before = await grabWorld(px, sy, 24);
    const selfB = await grabWorld(px, sy, 24);
    A.log('岩柱区：静止两帧自身差异 ' + diffPct(before, selfB) + '%');

    await ev('(()=>{const S=window.__rap.state;' +
      'S.run.pillars = [{ x: ' + px + ', w: 3, top: ' + (pgy + 3) + ', born: 0 }];' +
      'return 1;})()');
    await sleep(420);
    const after = await grabWorld(px, sy, 24);
    const d = diffPct(before, after);
    A.log('加柱子后（柱身中段）：差异 ' + d + '%');
    A.chk('B 岩柱被画出来了（柱身中段像素差异 >= 15%）', d >= 15, d + '%');

    await ev('window.__rap.state.run.pillars = [];');
    await sleep(420);
    const gone = await grabWorld(px, sy, 24);
    A.chk('B2 柱子清掉后柱身区域回到原样（不是画上就擦不掉）',
      diffPct(before, gone) < 6, diffPct(before, gone) + '% vs 有柱子 ' + d + '%');
  }

  /* ── 雷屏障 ── */
  await setup(true);
  {
    const br = JSON.parse(await ev('(()=>{const S=window.__rap.state; ' +
      'const b=S.run.barriers[0], cm=S.camLastDraw||S.camLive; ' +
      'return JSON.stringify({col:b.col, h:b.h, camX:cm.x, camY:cm.y, zoom:cm.zoom, ' +
      'gy: window.__rap.RAP.groundY(S.run, b.col+0.5)});})()'));
    /* ⚠ 必须锁镜头、并用世界坐标采样。
     *
     * 冲刺会改 `car.vx`（`dashAccel` 每帧 +16 m/s²）→ 镜头目标跟着变
     * → `camState.zoom` 开始指数收敛 → 两次采样之间整块区域平移。
     * 实测：不锁镜头时 C3 在 4.5%~10.5% 之间跳，阈值 6% 时红时绿 ——
     * 一条**偶尔才通过**的断言比没有更坏，因为它会随机掩盖真回归。 */
    await lockCam(br.camX, br.camY, br.zoom);
    await sleep(300);
    const bx = br.col + 0.5, by = br.gy + br.h * 0.5;
    const solid = await grabWorld(bx, by, 55);
    A.chk('C 前提：屏障真的在引擎里',
      await ev('window.__rap.state.run.barriers.length') === 1,
      (await ev('window.__rap.state.run.barriers.length')) + ' 道');

    /* 与"没有屏障"对照：把 barriers 清掉再抓一帧 */
    await ev('window.__rap.state.run.barriers = [];');
    await sleep(400);
    const none = await grabWorld(bx, by, 55);
    const d = diffPct(none, solid);
    A.log('屏障 vs 无屏障：差异 ' + d + '%');
    A.chk('C2 雷屏障被画出来了（有无对照差异 ≥ 15%）', d >= 15, d + '%');

    /* 冲刺时变淡 */
    await ev('(()=>{const S=window.__rap.state;' +
      'S.run.barriers = [{ col: ' + br.col + ', h: ' + br.h + ' }]; return 1;})()');
    await sleep(340);
    await ev('window.__rap.triggerSeed("electro")');
    await sleep(340);
    const ghost = await grabWorld(bx, by, 55);
    const dashing = diffPct(solid, ghost);
    A.log('冲刺时屏障变化 ' + dashing + '%');
    A.chk('C3 冲刺时屏障变淡（前后差异 ≥ 6%，玩家看得出"这一下穿得过去"）',
      dashing >= 6, dashing + '%');
  }

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

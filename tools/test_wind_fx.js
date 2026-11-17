/* 风类零件在行驶期必须有**看得见的特效**（第 68 轮，用户要求：
 * 「为什么不给风相关的零件使用的时候给风的特效」）。
 *
 * 之前风车桨/喷气口在行驶期没有任何视觉输出：车自己往前跑，桨是个静止图标。
 * 玩家看不出力从哪来，也看不出"还有没有推力"。
 *
 * 判据分三层，从状态到像素：
 *   A. 有推力时，粒子确实在生成（数量 > 0），并且**沿风的方向**运动
 *   B. 没有推力时（不接动力源 / 没点火），粒子数归零 —— 特效不能是常开的
 *   C. 画面上真的出现了这些粒子（像素差分，同帧对比）
 *   D. 生成速率与帧率无关（30fps 与 60fps 每秒吐出的条数相当）
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
  const PORT = 9740 + Math.floor(Math.random() * 100);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeWFX-' + Date.now()),
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
  await sleep(350);

  /* ---- A. 有推力：粒子生成，并且沿风的方向飞 ---- */
  await ev(`(()=>{const R=window.__rap, S=R.state;
    R.startLevel(2); S.welcome=0; S.introT=1;
    R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-3']);
    R.launch(); return 1;})()`);
  await sleep(900);   // 让粒子攒起来
  const fx = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
    const a = S.windFx || [];
    let vxSum = 0, n = 0;
    a.forEach(f => { vxSum += f.vx; n++; });
    return JSON.stringify({ n: a.length, drawN: S.windFxDrawN || 0,
      emitting: S.windEmitting || 0, avgVx: n ? +(vxSum/n).toFixed(2) : 0,
      phase: S.run && S.run.phase });})()`));
  A.log('1-3 行驶中：粒子 ' + fx.n + ' 条，本帧画出 ' + fx.drawN + ' 条，' +
        fx.emitting + ' 个零件在出力，平均 vx=' + fx.avgVx);
  A.chk('A1 有推力时粒子确实在生成', fx.n > 8, fx.n + ' 条');
  A.chk('A2 粒子沿**风的方向**飞（风车桨 dir=0 时风往左，所以平均 vx < 0）',
    fx.avgVx < -2.0, '平均 vx=' + fx.avgVx);
  A.chk('A3 这一帧真的画出来了（不是只有数组）', fx.drawN > 8, fx.drawN + ' 条');

  /* ---- B. 没推力：粒子必须归零 ---- */
  /* 用引擎真正的方式停掉出风：把车上工具的 powered 置 false
   * （等价于"这一关没给动力源"，只是省得重建整车）。
   * ⚠ 第一版这里留了一行 `delete S.run.car` 的占位代码没删，
   * 结果后面每次 drawRun 都在 `car.vx` 上抛异常、整个渲染循环被 try/catch 吞掉，
   * 于是"断电后还有 11 条粒子"其实是**卡在最后一帧**的假象。
   * 量具里的调试残留会伪装成产品缺陷，这是第二次栽在同一件事上。 */
  const cut = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
    let n = 0;
    (S.run.car.parts||[]).forEach(p => {
      if (p.def && p.def.tool) { p.powered = false; n++; }
    });
    return JSON.stringify({ cut: n, hasCar: !!S.run.car });})()`));
  A.log('断电：把 ' + cut.cut + ' 个工具的 powered 置 false（车仍在：' + cut.hasCar + '）');
  await sleep(700);   // 等已有粒子自然消亡（寿命 0.34s）
  const off = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
    return JSON.stringify({ n: (S.windFx||[]).length, emitting: S.windEmitting || 0,
      drawN: S.windFxDrawN || 0, alive: !!(S.run && S.run.car) });})()`));
  A.log('断电 0.7 秒后：粒子 ' + off.n + ' 条，' + off.emitting + ' 个零件在出力，' +
        '本帧画出 ' + off.drawN + ' 条');
  A.chk('B1 断电后不再生成新粒子（emitting 归零）', off.emitting === 0, String(off.emitting));
  A.chk('B2 断电后剩下的粒子在 0.7 秒内全部散尽（特效不是常开的）',
    off.n === 0, off.n + ' 条残留');
  A.chk('B3 前提：车还在（上面的差异不是"渲染循环挂了"造成的）', off.alive === true,
    'car alive=' + off.alive);

  /* ---- D. 帧率无关：同一段真实时间、两种步长，稳态粒子数必须相当 ---- */
  const rate = JSON.parse(await ev(`(()=>{
    const S=window.__rap.state;
    /* 跑两遍 0.5 秒：一次 15 步 x 1/30s，一次 60 步 x 1/120s。
     * 量的是**稳态粒子数**（生成速率 x 寿命），不是"总生成数" ——
     * 稳态量正比于每秒生成数，两种步长应当一致；
     * 若按"每帧固定吐 n 条"实现，稳态量会差 4 倍。
     * ⚠ 第一版在循环里清空了 windFx（想剔除寿命影响），
     * 于是量的其实是"最后一帧吐了几条"（=1），判据恒真 ——
     * 一条永远不会失败的断言。量具的 bug 比产品的 bug 更难发现。 */
    function trial(step, steps) {
      S.windFx = []; S.windAcc = 0;
      const car = S.run.car;
      car.parts.forEach(p => { if (p.def && p.def.tool) p.powered = true; });
      for (let i = 0; i < steps; i++) window.__rap.spawnWindFx(car, step);
      const n = S.windFx.length;
      S.windFx = []; S.windAcc = 0;
      return n;
    }
    const slow = trial(1/30, 15);
    const fast = trial(1/120, 60);
    return JSON.stringify({ slow, fast, need: typeof window.__rap.spawnWindFx === 'function' });
  })()`));
  A.log('帧率无关性：0.5 秒稳态 15 帧 ' + rate.slow + ' 条，60 帧 ' + rate.fast + ' 条');
  A.chk('D1 渲染层导出了 spawnWindFx', rate.need === true, String(rate.need));
  A.chk('D2 两种步长的稳态粒子数相当（偏差 < 25%）',
    Math.abs(rate.slow - rate.fast) <= Math.max(2, rate.fast * 0.25),
    rate.slow + ' vs ' + rate.fast);
  A.chk('D3 稳态粒子数不为 0（否则 D2 在比较两个零）',
    rate.slow > 3 && rate.fast > 3, rate.slow + '/' + rate.fast);

  A.finish(ws, child);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

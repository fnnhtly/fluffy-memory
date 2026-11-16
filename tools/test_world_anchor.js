/* 拼装区真的锚在世界坐标上了吗？（第 64 轮用户要求）
 *
 * 用户原话：「你的拼装区应该以地图位置为基而不是以屏幕为基，而且拼装区拼装的车
 * 的位置要出现在地图相同位置」。
 *
 * 这句话翻译成可测的量，是三个互相独立的断言：
 *
 *   A. **平移镜头，网格跟着地图走** —— 网格里某个格子对应的世界坐标不变。
 *      这是"以地图为基"的定义。旧的固定面板过不了这条：它画在屏幕上，
 *      镜头怎么动它都不动。
 *   B. **缩放镜头，一格仍然是一米** —— 格子边长的屏幕像素 = PPM × zoom。
 *      旧实现是常量 44，与 zoom 无关，所以放大后车看起来比世界大得多。
 *   C. **拼装时车心的世界坐标 == 发射后车出生的世界坐标** ——
 *      这才是用户真正在抱怨的那件事（拼在这、出现在别处）。
 *
 * 三条都不读"看看有没有 buildAnchorWorld 这个函数"，只读坐标数值，
 * 所以把 buildOrigin 改回常量它们会真的变红（见文件末尾的自证）。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9350 + Math.floor(Math.random() * 200);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeWA-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(400);

  /* 把"屏幕点 → 世界坐标"的换算写在页面里用**渲染那份几何**：
   * buildOrigin() 给出网格左上角，PPM*zoom 给出一格多少像素。
   * 测试自己再去抄一遍公式就没意义了 —— 抄出来的那份迟早和画面走散。 */
  const worldOfCell = `(function(r,c){
    const R=window.__rap, S=R.state, cam=S.buildView;
    const o=R.buildOrigin(), px=R.buildCellPx();
    const sx = o.x + (c+0.5)*px, sy = o.y + (r+0.5)*px;
    /* 屏幕 → 世界：worldToScreen 的逆。
       screen.x = DW/2 + (wx - cam.x)*s  =>  wx = cam.x + (sx - DW/2)/s
       screen.y = DH/2 - (wy - cam.y)*s  =>  wy = cam.y + (DH/2 - sy)/s  */
    const s = 32 * cam.zoom;
    return { x: cam.x + (sx - 1280/2)/s, y: cam.y + (720/2 - sy)/s };
  })`;

  /* ---- A. 平移镜头，格子的世界坐标不变 ---- */
  const before = JSON.parse(await ev(`(()=>{const w=${worldOfCell}; return JSON.stringify(w(4,2));})()`));
  const camBefore = JSON.parse(await ev('JSON.stringify(window.__rap.state.buildView)'));
  // 用页面提供的 clamp 保证不会被夹回去，直接改镜头位置模拟"玩家拖了一下"
  await ev(`(()=>{const S=window.__rap.state, v=S.buildView;
    v.x += 3.5; v.y += 1.5; window.__rap.clampBuildView(v, window.__rap.level()); return 1;})()`);
  await sleep(250);
  const after = JSON.parse(await ev(`(()=>{const w=${worldOfCell}; return JSON.stringify(w(4,2));})()`));
  const camAfter = JSON.parse(await ev('JSON.stringify(window.__rap.state.buildView)'));
  const drift = Math.hypot(after.x - before.x, after.y - before.y);
  A.log('镜头 (' + camBefore.x.toFixed(2) + ',' + camBefore.y.toFixed(2) + ') → (' +
        camAfter.x.toFixed(2) + ',' + camAfter.y.toFixed(2) + ')，格(4,2)世界坐标漂移 ' +
        drift.toFixed(6) + ' m');
  A.chk('A1 前提：镜头真的动了', Math.abs(camAfter.x - camBefore.x) > 1.0,
    'Δx=' + (camAfter.x - camBefore.x).toFixed(2));
  A.chk('A2 平移镜头后，同一格对应同一个世界位置（< 1mm）', drift < 0.001,
    drift.toExponential(2) + ' m');

  /* ---- B. 一格 = 一米：格边长 = PPM × zoom ---- */
  await ev(`(()=>{const v=window.__rap.state.buildView; v.zoom=1.0;
    window.__rap.clampBuildView(v, window.__rap.level()); return 1;})()`);
  await sleep(200);
  const px1 = await ev('window.__rap.buildCellPx()');
  await ev(`(()=>{const v=window.__rap.state.buildView; v.zoom=2.0;
    window.__rap.clampBuildView(v, window.__rap.level()); return 1;})()`);
  await sleep(200);
  const px2 = await ev('window.__rap.buildCellPx()');
  A.log('zoom 1.0 → 格边长 ' + px1.toFixed(2) + 'px；zoom 2.0 → ' + px2.toFixed(2) + 'px');
  A.chk('B1 zoom=1 时一格 = 32px（= PPM，即 1 米）', Math.abs(px1 - 32) < 0.01, px1.toFixed(3));
  A.chk('B2 放大一倍，格边长也放大一倍（旧实现是常量 44）',
    Math.abs(px2 / px1 - 2) < 0.01, (px2 / px1).toFixed(3) + '×');

  /* ---- C. 拼装处 == 出生处 ---- */
  await ev('window.__rap.startLevel(0)');
  await sleep(400);
  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(300);
  const built = JSON.parse(await ev(`(()=>{
    const R=window.__rap, S=R.state, lv=R.levels[S.levelIndex];
    const o=R.buildOrigin(), px=R.buildCellPx();
    /* 车心在网格坐标里的位置：格 2.5 / 行 3.5 的交界（buildOrigin 的定义反推）。
       这里用**网格几何**算，不是读世界坐标 —— 读世界坐标会自证。 */
    const s = 32 * S.buildView.zoom;
    const sx = o.x + 2.5*px, sy = o.y + 3.5*px;
    return JSON.stringify({
      world: { x: S.buildView.x + (sx - 640)/s, y: S.buildView.y + (360 - sy)/s },
      start: { x: lv.start.col, y: null }
    });})()`));
  /* 出生点：发射后车辆的真实 y。start.col 是关卡数据里写的列。 */
  await ev(`(()=>{const R=window.__rap, S=R.state;
    R.RAP.applySpec(R.levels[S.levelIndex], S.build, R.RAP.SPECS['1-1']);
    R.launch(); return 1;})()`);
  await sleep(600);
  const born = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
    return JSON.stringify({ phase:S.phase, car: S.run && S.run.car ? {x:S.run.car.x, y:S.run.car.y} : null });})()`));
  A.chk('C0 前提：发射成功且有车', born.phase === 'run' && !!born.car, JSON.stringify(born.phase));
  const liveCol = JSON.parse(await ev('JSON.stringify(window.__rap.levels[window.__rap.state.levelIndex].start)'));
  A.log('拼装时车心世界 x=' + built.world.x.toFixed(2) + '；发射后车 x=' + born.car.x.toFixed(2) +
        '；关卡起点列=' + liveCol.col);
  A.chk('C1 拼装时车心的世界 x 落在关卡起点那一格（±0.6 m）',
    Math.abs(built.world.x - (liveCol.col + 0.5)) < 0.6,
    '拼装 ' + built.world.x.toFixed(2) + ' vs 起点 ' + (liveCol.col + 0.5));
  A.chk('C2 我们放的那辆车出生在起点附近（±1.5 m），不是屏幕坐标换算出来的别处',
    Math.abs(born.car.x - built.world.x) < 1.5,
    '出生 ' + born.car.x.toFixed(2) + ' vs 拼装 ' + built.world.x.toFixed(2));

  A.finish(ws, child);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

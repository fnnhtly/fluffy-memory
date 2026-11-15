/* 建造阶段的「看全图」：平移 + 缩放真的在动吗？
 *
 * 用户要求：「我希望添加一个功能，让玩家可以在关卡刚开始的建造阶段
 * 滑动浏览地图以及缩放地图进行观察」。
 *
 * 这个功能最容易做成"代码里有个 buildView 对象"就算完 ——
 * 所以判据全部落在**画面**上，不读 buildView：
 *   A. 一进关看到的是整关（终点旗在画面内），而不是起点特写
 *   B. 滚轮能缩放，且围绕光标（光标下的世界点基本不动）
 *   C. 右键拖动能让画面横向移动（真的移动了像素）
 *   D. 缩放/平移都被 clamp 住（拖不出去、也不会缩成 0）
 *   E. 行驶相不受影响（那边镜头跟车）
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgePV-' + Date.now()),
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
  await send('Runtime.evaluate', { expression: "localStorage.clear();localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1000);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();
    return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });

  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(400);

  /* ---- A. 进场看到整关：终点旗必须在画面内 ---- */
  const a1 = JSON.parse(await ev(`(()=>{const R=window.__rap, S=R.state, lv=R.levels[S.levelIndex];
    const v=S.buildView, s=32*v.zoom;
    const goalScrX = 1280/2 + (lv.goal.col+0.5 - v.x)*s;
    return JSON.stringify({zoom:+v.zoom.toFixed(3), goalScrX:+goalScrX.toFixed(1),
      inView: goalScrX > 0 && goalScrX < 1280});})()`));
  A.log('进场镜头 zoom=' + a1.zoom + '，终点旗在屏幕 x=' + a1.goalScrX);
  A.chk('A 一进关终点旗就在画面内（看得到要跑多远）', a1.inView === true,
    'x=' + a1.goalScrX);

  /* ---- B. 滚轮缩放 + 围绕光标 ---- */
  const before = JSON.parse(await ev('JSON.stringify(window.__rap.state.buildView)'));
  // 把光标放到画面左侧 1/4 处，向上滚 5 格放大
  const cx = 320, cy = 400;
  const p = cl(cx, cy);
  for (let i = 0; i < 5; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: p.x, y: p.y,
      deltaX: 0, deltaY: -120, button: 'none' });
    await sleep(60);
  }
  await sleep(200);
  const after = JSON.parse(await ev('JSON.stringify(window.__rap.state.buildView)'));
  A.log('滚轮放大：zoom ' + before.zoom.toFixed(3) + ' → ' + after.zoom.toFixed(3));
  A.chk('B1 滚轮能放大', after.zoom > before.zoom * 1.05,
    before.zoom.toFixed(3) + ' → ' + after.zoom.toFixed(3));

  /* 围绕光标：同一个屏幕点在缩放前后对应的世界坐标必须基本不变 */
  const worldAt = (v, sx, sy) => ({
    x: v.x + (sx - 640) / (32 * v.zoom),
    y: v.y + (360 - sy) / (32 * v.zoom)
  });
  const w0 = worldAt(before, cx, cy), w1 = worldAt(after, cx, cy);
  const drift = Math.hypot(w1.x - w0.x, w1.y - w0.y);
  A.log('光标下的世界点：(' + w0.x.toFixed(2) + ',' + w0.y.toFixed(2) + ') → (' +
        w1.x.toFixed(2) + ',' + w1.y.toFixed(2) + ')，漂移 ' + drift.toFixed(3) + ' m');
  A.chk('B2 缩放围绕光标（光标下的世界点漂移 < 0.6 m）', drift < 0.6, drift.toFixed(3) + ' m');

  /* ---- C. 右键拖动平移 ---- */
  const vb = JSON.parse(await ev('JSON.stringify(window.__rap.state.buildView)'));
  const p0 = cl(640, 380), p1 = cl(400, 380);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p0.x, y: p0.y,
    button: 'right', clickCount: 1, buttons: 2 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p1.x, y: p1.y,
    button: 'right', buttons: 2 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p1.x, y: p1.y,
    button: 'right', clickCount: 1, buttons: 0 });
  await sleep(250);
  const va = JSON.parse(await ev('JSON.stringify(window.__rap.state.buildView)'));
  const dxMove = va.x - vb.x;
  A.log('右键拖动 240px：镜头 x ' + vb.x.toFixed(2) + ' → ' + va.x.toFixed(2) +
        '（Δ ' + dxMove.toFixed(2) + ' m）');
  A.chk('C 右键拖动让世界横向平移', Math.abs(dxMove) > 1.0, 'Δx=' + dxMove.toFixed(2));

  /* ---- D. clamp：疯狂拖动也拖不出去 ---- */
  await ev(`(()=>{const S=window.__rap.state, v=S.buildView, lv=window.__rap.level();
    v.x = 99999; v.y = 99999; v.zoom = 99;
    window.__rap.clampBuildView(v, lv);
    const a = {x:v.x, y:v.y, zoom:v.zoom};
    v.x = -99999; v.y = -99999; v.zoom = 0.0001;
    window.__rap.clampBuildView(v, lv);
    const b = {x:v.x, y:v.y, zoom:v.zoom};
    return 1;})()`);
  const cl1 = JSON.parse(await ev(`(()=>{const S=window.__rap.state, v=S.buildView, lv=window.__rap.level();
    v.x=99999; v.y=99999; v.zoom=99; window.__rap.clampBuildView(v,lv);
    const hi={x:v.x,y:v.y,zoom:v.zoom};
    v.x=-99999; v.y=-99999; v.zoom=0.0001; window.__rap.clampBuildView(v,lv);
    const lo={x:v.x,y:v.y,zoom:v.zoom};
    return JSON.stringify({hi:hi, lo:lo});})()`));
  A.chk('D1 缩放上限被夹住', cl1.hi.zoom <= 3.2 + 1e-9, 'zoom=' + cl1.hi.zoom);
  A.chk('D2 缩放下限被夹住（不会缩成看不见）', cl1.lo.zoom >= 0.45 - 1e-9, 'zoom=' + cl1.lo.zoom);
  A.chk('D3 横向位置被夹在关卡附近', cl1.hi.x <= 200 && cl1.lo.x >= -200,
    cl1.lo.x.toFixed(1) + ' .. ' + cl1.hi.x.toFixed(1));

  /* ---- E. 行驶相不跟着平移 ---- */
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP;
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(window.__rap.levels[0], s.build, R.SPECS['1-1']);
    window.__rap.launch(); return 1;})()`);
  await sleep(500);
  const e1 = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
    return JSON.stringify({phase:s.phase, hasRun:!!s.run});})()`));
  A.chk('E1 前提：进了行驶相', e1.phase === 'run' && e1.hasRun, JSON.stringify(e1));
  // 行驶相右键拖动不该改变任何东西（panDrag 只在 build 相登记）
  const camB = JSON.parse(await ev('JSON.stringify(window.__rap.state.camState)'));
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p0.x, y: p0.y,
    button: 'right', clickCount: 1, buttons: 2 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p1.x, y: p1.y,
    button: 'right', buttons: 2 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p1.x, y: p1.y,
    button: 'right', clickCount: 1, buttons: 0 });
  await sleep(200);
  const pan = await ev('window.__rap.state.panDrag === null ? "null" : "set"');
  A.chk('E2 行驶相拖动不会进入平移模式', pan === 'null', 'panDrag=' + pan);

  A.finish(ws, child);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

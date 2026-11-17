/* 「视角立刻回拼装区」按钮（第 66 轮，用户要求）。
 *
 * 用户原话：「刚进入关卡的视角怎么在拼装区右边，为什么不增加一个让视角
 * 立刻回拼装区的按钮」。
 *
 * 两件事：
 *   1. 进关时镜头把**网格左边缘**钉在 x=168（为了避开左侧工具栏），
 *      于是网格整体偏向左边，视觉重心不在中间 —— 用户看到的是"在右边"。
 *      → buildViewDefault 改成把网格**整块居中**，工具栏改放右边那排空白处。
 *   2. 玩家自己拖走了镜头之后，没有任何一键回到拼装区的办法。
 *      → 托盘右侧加一颗「回拼装区」圆钮（和观察键并排），
 *        按下时把 state.buildView 缓动回 buildViewDefault(level())。
 *
 * 缓动而不是瞬移：瞬移会让人失去"我回到哪了"的空间感（视角突然跳，
 * 玩家得重新找车）。0.35 秒的 ease-out 足够短到不挡手，又足以看见"我回来了"。
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
  const PORT = 9640 + Math.floor(Math.random() * 120);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeRC-' + Date.now()),
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
  await sleep(400);

  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();
    return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function clickAt(dx, dy) {
    const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y,
      button: 'left', clickCount: 1, buttons: 1 });
    await sleep(50);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y,
      button: 'left', clickCount: 1, buttons: 0 });
    await sleep(200);
  }

  /* A. 进关时网格是**居中**的（用户抱怨"在右边"） */
  const layout = JSON.parse(await ev(`(()=>{
    const R=window.__rap, S=R.state;
    const o=R.buildOrigin(), px=R.buildCellPx();
    const left=o.x, right=o.x+R.RAP.BUILD_COLS*px;
    return JSON.stringify({ left:+left.toFixed(0), right:+right.toFixed(0),
      mid:+((left+right)/2).toFixed(0), dw:1280,
      offCentre:+(((left+right)/2 - 640)).toFixed(0) });
  })()`));
  A.log('拼装区横向 ' + layout.left + '..' + layout.right + '，中心 x=' + layout.mid +
        '（画面中心 640，偏 ' + layout.offCentre + 'px）');
  A.chk('A1 拼装区大致居中（中心偏离画面中心 < 80px）',
    Math.abs(layout.offCentre) < 80, '偏 ' + layout.offCentre + 'px');
  A.chk('A2 拼装区整块在画面内（不贴边）', layout.left > 40 && layout.right < 1240,
    layout.left + '..' + layout.right);

  /* B. 回拼装区按钮存在、可点、点了能把镜头拉回来 */
  const has = await ev(`typeof window.__rap.recentreRect === 'function'`);
  A.chk('B1 引擎导出了回拼装区按钮的矩形（绘制与判定同一份）', has === true, String(has));
  const rr = JSON.parse(await ev('JSON.stringify(window.__rap.recentreRect())'));
  A.log('回拼装区按钮矩形 ' + JSON.stringify(rr));
  A.chk('B2 按钮在画面内且大小合理', rr.x > 0 && rr.x + rr.w < 1280 &&
    rr.y > 0 && rr.y + rr.h < 720 && rr.w >= 40 && rr.h >= 40,
    rr.w + '×' + rr.h + ' @' + rr.x + ',' + rr.y);

  // 先把镜头拖到别处
  await ev(`(()=>{const S=window.__rap.state; S.buildView.x += 9; S.buildView.y += 4; S.buildView.zoom = 2.6;
    window.__rap.clampBuildView(S.buildView, window.__rap.level()); return 1;})()`);
  await sleep(300);
  const before = JSON.parse(await ev('JSON.stringify(window.__rap.state.buildView)'));
  await clickAt(rr.x + rr.w / 2, rr.y + rr.h / 2);
  await sleep(600);   // 等缓动跑完
  const after = JSON.parse(await ev('JSON.stringify(window.__rap.state.buildView)'));
  const home = JSON.parse(await ev('JSON.stringify(window.__rap.buildViewDefault(window.__rap.level()))'));
  const dHome = Math.hypot(after.x - home.x, after.y - home.y);
  A.log('点按钮前 ' + JSON.stringify({x:+before.x.toFixed(2), y:+before.y.toFixed(2), z:+before.zoom.toFixed(2)}) +
        ' → 之后 ' + JSON.stringify({x:+after.x.toFixed(2), y:+after.y.toFixed(2), z:+after.zoom.toFixed(2)}) +
        '（默认视角 ' + JSON.stringify({x:+home.x.toFixed(2), y:+home.y.toFixed(2), z:+home.zoom.toFixed(2)}) + '）');
  A.chk('B3 前提：点之前镜头确实被拖走了',
    Math.hypot(before.x - home.x, before.y - home.y) > 2, '偏离 ' +
    Math.hypot(before.x - home.x, before.y - home.y).toFixed(2) + ' m');
  A.chk('B4 点一下之后镜头回到默认视角（< 0.3 m）', dHome < 0.3, dHome.toFixed(3) + ' m');
  A.chk('B5 缩放也回到默认值（±0.02）', Math.abs(after.zoom - home.zoom) < 0.02,
    after.zoom.toFixed(3) + ' vs ' + home.zoom.toFixed(3));

  /* C. 缓动而不是瞬移：按下后一帧之内不该已经到位 */
  await ev(`(()=>{const S=window.__rap.state; S.buildView.x += 9; S.buildView.y += 4;
    window.__rap.clampBuildView(S.buildView, window.__rap.level()); return 1;})()`);
  await sleep(250);
  await clickAt(rr.x + rr.w / 2, rr.y + rr.h / 2);
  const mid = JSON.parse(await ev('JSON.stringify(window.__rap.state.buildView)'));
  await sleep(700);
  const done = JSON.parse(await ev('JSON.stringify(window.__rap.state.buildView)'));
  A.log('点后瞬间 x=' + mid.x.toFixed(2) + '，800ms 后 x=' + done.x.toFixed(2));
  A.chk('C 是缓动不是瞬移（按下的瞬间还没到位）',
    Math.abs(mid.x - home.x) > 0.05 || Math.abs(mid.y - home.y) > 0.05,
    '瞬时偏差 ' + Math.hypot(mid.x - home.x, mid.y - home.y).toFixed(3) + ' m');

  A.finish(ws, child);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

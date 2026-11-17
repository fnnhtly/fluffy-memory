/* 拍一张第 64 轮的建造相截图，直接看「拼装区是否落在关卡起点上」。
 * 用法：node tools/shot_round64.js
 * 输出：records/shots/r64-build.png 与 r64-observe.png
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9900 + Math.floor(Math.random() * 90);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, 'records', 'shots');

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeS-' + Date.now()),
    '--window-size=1280,760', '--force-device-scale-factor=1', '--no-first-run',
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
  await send('Page.navigate', { url: PAGE }); await sleep(1400);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(500);

  async function shot(name) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const f = path.join(OUT, name);
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    console.log('shot ->', f, (fs.statSync(f).size / 1024).toFixed(0) + ' KB');
  }

  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();
    return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function clickDesign(dx, dy) {
    const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 1 });
    await sleep(50);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(180);
  }

  const geom = JSON.parse(await ev(`(()=>{const o=window.__rap.buildOrigin(), px=window.__rap.buildCellPx();
    return JSON.stringify({o:o, px:px});})()`));
  const cell = (r, c) => ({ x: geom.o.x + c * geom.px + geom.px / 2, y: geom.o.y + r * geom.px + geom.px / 2 });

  // 搭一辆最朴素的木框车（和 1-1 的标准解一致）
  for (const [r, c] of [[4, 2], [4, 3], [5, 2], [5, 3]]) {
    const q = cell(r, c); await clickDesign(q.x, q.y);
  }
  // 放轮子：先点托盘，再点格子
  const TRAY = JSON.parse(await ev('JSON.stringify(window.__rap.TRAY)'));
  const trayIdx = TRAY.indexOf('wood_wheel');
  const tRect = JSON.parse(await ev(`JSON.stringify(window.__rap.trayRect(${trayIdx}))`));
  await clickDesign(tRect.x + tRect.w / 2, tRect.y + tRect.h / 2);
  for (const [r, c] of [[5, 1], [5, 4]]) {
    const q = cell(r, c); await clickDesign(q.x, q.y);
  }
  await sleep(400);
  console.log('cells now:', await ev('Object.keys(window.__rap.state.build.cells).length'));
  await shot('r64-build.png');

  // 打开观察模式
  const ob = JSON.parse(await ev('JSON.stringify(window.__rap.state.observe)'));
  console.log('observe before:', ob);
  await shot('r64-observe.png');

  // 报告拼装区与起点的对齐关系（这就是用户抱怨的那件事）
  console.log(await ev(`(()=>{const R=window.__rap, S=R.state, lv=R.levels[S.levelIndex];
    const o=R.buildOrigin(), px=R.buildCellPx();
    const carScreen = { x: o.x + 2.5*px, y: o.y + 3.5*px };   // 车心（格 2.5,3.5 的交界）
    return JSON.stringify({
      level: lv.levelId,
      startCol: lv.start.col,
      gridLeftX: +o.x.toFixed(1),
      /* 列/行数**从引擎现取**：写死 6×8 的时候，网格改成 6×6 之后这份读数
       * 还在按 8 行算（gridBottomY 报 552.6，真值 471）—— 量具自己算错，
       * 比没有量具更坏。 */
      gridRightX: +(o.x + R.RAP.BUILD_COLS * px).toFixed(1),
      gridTopY: +o.y.toFixed(1),
      gridBottomY: +(o.y + R.RAP.BUILD_ROWS * px).toFixed(1),
      carCentreOnScreen: { x: +carScreen.x.toFixed(1), y: +carScreen.y.toFixed(1) },
      pxPerCell: +px.toFixed(2)
    }, null, 1);})()`));

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

/* 为什么 test_eraser 的"先放下两块木框"变成 0 块了？
 * 逐步记录：点托盘 → selected 是什么 → 点格子 → cellAt 命中的是哪格 → tryPlace 说什么。 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9750 + Math.floor(Math.random() * 200);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeP-' + Date.now()),
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

  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();
    return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  console.log('canvas rect', rect);
  // 设计坐标 → CSS 像素（照抄测试里的换算）
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });

  async function clickAt(dx, dy, label) {
    const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 1 });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(160);
    const st = await ev(`(()=>{const S=window.__rap.state;
      return JSON.stringify({selected:S.selected, mouse:S.mouse, phase:S.phase,
        cells:Object.keys(S.build.cells).length});})()`);
    console.log('  click', label, JSON.stringify({ dx: +dx.toFixed(1), dy: +dy.toFixed(1) }), '->', st);
  }

  // 1) 点托盘里的 wood_frame
  const trayIdx = await ev("window.__rap.TRAY.indexOf('wood_frame')");
  const tRect = JSON.parse(await ev(`JSON.stringify(window.__rap.trayRect(${trayIdx}))`));
  console.log('trayRect(wood_frame) =', tRect);
  await clickAt(tRect.x + tRect.w / 2, tRect.y + tRect.h / 2, 'tray wood_frame');

  // 2) 点格子 (4,1)、(4,2)
  const geom = JSON.parse(await ev(`(()=>{const o=window.__rap.buildOrigin(), px=window.__rap.buildCellPx();
    return JSON.stringify({o:o, px:px});})()`));
  console.log('origin', geom.o, 'px', geom.px);
  const cell = (r, c) => ({ x: geom.o.x + c * geom.px + geom.px / 2, y: geom.o.y + r * geom.px + geom.px / 2 });
  for (const [r, c] of [[4, 1], [4, 2]]) {
    const q = cell(r, c);
    const hit = await ev(`JSON.stringify(window.__rap.cellAt(${q.x},${q.y}))`);
    const canRes = await ev(`(()=>{const R=window.__rap;const S=R.state;
      const g=R.RAP.canPlace(R.level(), S.build, S.selected, ${r}, ${c});
      return JSON.stringify(g);})()`);
    console.log(`  cell(${r},${c}) design=(${q.x.toFixed(1)},${q.y.toFixed(1)}) cellAt=${hit} canPlace=${canRes}`);
    await clickAt(q.x, q.y, `cell(${r},${c})`);
  }

  console.log('final cells:', await ev('JSON.stringify(window.__rap.state.build.cells)'));

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

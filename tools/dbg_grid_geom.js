/* 为什么第 64 轮之后有一批测试的"前提"挂了？直接读几何。 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9700 + Math.floor(Math.random() * 200);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeG-' + Date.now()),
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

  console.log(await ev(`(()=>{
    const R=window.__rap, S=R.state, lv=R.levels[S.levelIndex];
    const o=R.buildOrigin(), px=R.buildCellPx();
    return JSON.stringify({
      level: lv.levelId,
      buildView: S.buildView,
      origin: o,
      px: px,
      BUILD_PX: R.BUILD_PX,
      anchor: R.buildAnchorWorld ? R.buildAnchorWorld() : 'no buildAnchorWorld',
      start: {col: lv.start ? lv.start.col : null, row: lv.start ? lv.start.row : null},
      cols: R.RAP.BUILD_COLS, rows: R.RAP.BUILD_ROWS,
      cell_4_1: {x: o.x+1*px+px/2, y: o.y+4*px+px/2},
      cell_4_2: {x: o.x+2*px+px/2, y: o.y+4*px+px/2},
      cellAt_4_1: R.cellAt(o.x+1*px+px/2, o.y+4*px+px/2),
      view: window.__view
    }, null, 1);
  })()`));

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

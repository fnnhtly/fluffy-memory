/* 拼装区相对地面在哪？把地面画到屏幕上的 y 与网格板的上下沿一起量出来。 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9720 + Math.floor(Math.random() * 90);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeGB-' + Date.now()),
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

  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(500);

  for (let lv = 0; lv < 6; lv++) {
    await ev(`window.__rap.startLevel(${lv})`);
    await sleep(250);
    await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
    await sleep(250);
    const info = JSON.parse(await ev(`(()=>{
      const R=window.__rap, S=R.state, lv=R.levels[S.levelIndex];
      const o=R.buildOrigin(), px=R.buildCellPx(), v=S.buildView;
      const ter=R.RAP.makeTerrain(lv);
      const s = 32*v.zoom;
      const surfScreenY = 360 - (ter.surfaceY(lv.start.col+0.5) - v.y)*s;
      const HD = Math.max(20, px*0.55);
      return JSON.stringify({
        level: lv.levelId,
        rows: RAP.BUILD_ROWS,
        gridTop: +(o.y - HD - 8).toFixed(0),
        /* 行数**从引擎现取**：写死 8 的时候，网格改成 6 行之后这里还在按 8 算，
         * 于是"网格比地面低 88px"这种读数其实是探针在虚报（真值只差 6px）。
         * 量具自己算错，比没有量具更坏。 */
        gridBottom: +(o.y + RAP.BUILD_ROWS * px).toFixed(0),
        groundAtStart: +surfScreenY.toFixed(0),
        groundMin: +Math.min(...Array.from({length:lv.grid.cols},(_,c)=>360-(ter.surfaceY(c+.5)-v.y)*s)).toFixed(0),
        groundMax: +Math.max(...Array.from({length:lv.grid.cols},(_,c)=>360-(ter.surfaceY(c+.5)-v.y)*s)).toFixed(0),
        zoom: +v.zoom.toFixed(2)
      });})()`));
    console.log(JSON.stringify(info));
  }

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

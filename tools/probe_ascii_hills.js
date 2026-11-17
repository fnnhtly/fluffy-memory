/* 把山带那一块打成 ASCII 图，直接"看"到底有没有山、有没有动。 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const PORT = 9620 + Math.floor(Math.random() * 100);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeAsc-' + Date.now()),
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
  await ev(`(()=>{const S=window.__rap.state; S.buildView.x = window.__rap.level().start.col + 6;
    window.__rap.clampBuildView(S.buildView, window.__rap.level()); return 1;})()`);
  await sleep(400);

  const grab = async (par) => {
    await ev('window.__rap.state.hillParX = ' + par);
    await sleep(340);
    return JSON.parse(await ev(`(()=>{
      const R=window.__rap, S=R.state, lv=R.levels[S.levelIndex];
      const ter=R.RAP.makeTerrain(lv), v=S.buildView, s=32*v.zoom;
      const horizonY = 360 - (ter.surfaceY(v.x) + 2.6 - v.y) * s;
      const cv=document.getElementById('cv'), g=cv.getContext('2d'), vv=window.__view;
      const k = cv.width / vv.W;
      const rows = [];
      for (let y = Math.round((horizonY-100)*k); y <= Math.round((horizonY+40)*k); y += Math.round(10*k)) {
        const d = g.getImageData(0, y, cv.width, 1).data;
        const out = [];
        for (let x = 0; x < cv.width; x += Math.round(16*k)) {
          out.push(Math.round(0.299*d[x*4]+0.587*d[x*4+1]+0.114*d[x*4+2]));
        }
        rows.push({ y: Math.round(y/k), v: out });
      }
      return JSON.stringify({horizonY:+horizonY.toFixed(1), rows, hillX:+(S.hillShiftX||0).toFixed(1)});
    })()`));
  };

  const a = await grab(0);
  const b = await grab(0.36);
  console.log('horizon', a.horizonY, ' shiftA', a.hillX, ' shiftB', b.hillX);
  const ramp = ' .:-=+*#%@';
  for (let i = 0; i < a.rows.length; i++) {
    const ra = a.rows[i], rb = b.rows[i];
    const s = v => v.map(x => ramp[Math.min(9, Math.floor(x / 26))]).join('');
    console.log(String(ra.y).padStart(4), 'A|' + s(ra.v) + '|');
    console.log('    ', 'B|' + s(rb.v) + '|');
  }

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

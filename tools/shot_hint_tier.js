/* 截一张「提示卡翻到第 4 层」的图（第 79 轮）。
 * 1-7 有 4 层提示，第 4 层是「成品：……」（最具体的那条）。
 * 修之前它永远显示不出来。这张图是那一层的视觉证据。
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, 'records', 'shots');

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const PORT = 9300 + Math.floor(Math.random() * 60);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeHintShot-' + Date.now()),
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
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  /* 1-7（索引 6）有 4 层提示 */
  for (const tier of [2, 3]) {
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(6); S.welcome=0; S.introT=1; S.phase='build'; S.run=null; S.runBanner=0;
      S.hintOpen = true; S.hintTier = ${tier};
      return 1;})()`);
    await sleep(600);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    const tag = tier === 2 ? 'tier3' : 'tier4';
    fs.writeFileSync(path.join(OUT, 'r79-hint-' + tag + '.png'), Buffer.from(s.data, 'base64'));
    console.log('saved r79-hint-' + tag + '.png');
  }

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

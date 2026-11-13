/* 验证"方向箭头 + 切换方向"：在 1-2 放一个打气筒，用右键/再点一次切方向并截图。 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);   // 随机端口：避免残留进程撞车
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edge3-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = list.find(t => t.type === 'page');
      if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  if (!wsUrl) { console.log('FAIL cdp'); child.kill(); process.exit(1); }
  const ws = new WebSocket(wsUrl);
  let id = 0; const pend = new Map();
  await new Promise(res => { ws.onopen = res; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE });
  await sleep(1200);
  const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }
  async function click(dx, dy, button = 'left') {
    const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button, clickCount: 1 });
    await sleep(140);
  }
  const tray = i => ({ x: (1280 - (8 * 56 + 7 * 8)) / 2 + i * 64 + 28, y: 720 - 92 + 28 });
  const cell = (r, c) => ({ x: (1280 / 2 - 120) + c * 40 + 20, y: 150 + r * 40 + 20 });
  const cells = () => ev(`JSON.stringify(window.__rap.state.build.cells)`);

  // 切到 1-2
  await click(24 + 1 * 86 + 40, 33);
  await sleep(300);
  for (const c of [1, 2, 3]) { await click(tray(0).x, tray(0).y); await click(cell(4, c).x, cell(4, c).y); }
  for (const c of [1, 3]) { await click(tray(1).x, tray(1).y); await click(cell(5, c).x, cell(5, c).y); }
  await click(tray(6).x, tray(6).y); await click(cell(4, 2).x, cell(4, 2).y);
  await click(tray(5).x, tray(5).y); await click(cell(3, 2).x, cell(3, 2).y);
  await sleep(200);
  await shot('arrow-0-right');
  const d0 = await ev(`window.__rap.state.build.cells['3,2'] && window.__rap.state.build.cells['3,2'].dir`);

  await click(cell(3, 2).x, cell(3, 2).y, 'right');   // 右键 → 转 90°
  await sleep(200); await shot('arrow-1-up');
  const d1 = await ev(`window.__rap.state.build.cells['3,2'] && window.__rap.state.build.cells['3,2'].dir`);

  await click(tray(5).x, tray(5).y);                   // 选回打气筒再点同一格 → 再转 90°
  await click(cell(3, 2).x, cell(3, 2).y);
  await sleep(200); await shot('arrow-2-left');
  const d2 = await ev(`window.__rap.state.build.cells['3,2'] && window.__rap.state.build.cells['3,2'].dir`);

  console.log('dir after place / right-click / click-again:', d0, d1, d2);
  console.log('cells:', await cells());
  ws.close(); child.kill(); process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

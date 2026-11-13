/* 验证：帮助面板、暂停/重来按钮、底部带变薄 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9341;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edge7-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = list.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(res => { ws.onopen = res; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }
  async function click(dx, dy) {
    const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(160);
  }
  const TRAY = ['wood_frame', 'wood_wheel', 'iron_wheel', 'motor', 'battery', 'pump', 'pig', 'eraser'];
  const tray = n => ({ x: (1280 - (8 * 46 + 7 * 7)) / 2 + TRAY.indexOf(n) * 53 + 23, y: 720 - 76 + 23 });
  const cell = (r, c) => ({ x: (1280 / 2 - 120) + c * 40 + 20, y: 150 + r * 40 + 20 });
  const out = [];

  // 帮助面板（建造界面）
  await click(1280 / 2 + 150 + 38, 372 + 22);
  out.push('帮助面板打开: ' + await ev('window.__rap.state.helpOpen'));
  await shot('hb-01-help');
  await click(1280 / 2 + 150 + 38, 372 + 22);
  out.push('帮助面板关闭: ' + await ev('window.__rap.state.helpOpen'));

  // 建车发射
  for (const c of [1, 2, 3]) { await click(tray('wood_frame').x, tray('wood_frame').y); await click(cell(4, c).x, cell(4, c).y); }
  for (const c of [1, 3]) { await click(tray('wood_wheel').x, tray('wood_wheel').y); await click(cell(5, c).x, cell(5, c).y); }
  await click(tray('pig').x, tray('pig').y); await click(cell(4, 2).x, cell(4, 2).y);
  await click(812, 326);
  await sleep(600);
  out.push('运行中 phase=' + await ev('window.__rap.state.phase'));
  await shot('hb-02-run');

  // 点暂停
  await click(24 + 23, 84 + 23);
  const p1 = await ev('window.__rap.state.paused');
  const t1 = await ev('window.__rap.state.run.time.toFixed(2)');
  await sleep(700);
  const t2 = await ev('window.__rap.state.run.time.toFixed(2)');
  out.push('暂停=' + p1 + '  暂停期间时间是否冻结: ' + (t1 === t2 ? '冻结 ✓ ' + t1 : '仍在走 ✗ ' + t1 + '→' + t2));
  await shot('hb-03-paused');

  // 继续
  await click(24 + 23, 84 + 23);
  await sleep(600);
  out.push('继续后 paused=' + await ev('window.__rap.state.paused') + ' t=' + await ev('window.__rap.state.run.time.toFixed(2)'));

  // 重来（回建造，零件保留）
  await click(24 + 23, 138 + 23);
  await sleep(300);
  out.push('重来后 phase=' + await ev('window.__rap.state.phase') + ' 零件数=' + await ev('Object.keys(window.__rap.state.build.cells).length'));
  await shot('hb-04-back-to-build');

  console.log(out.join('\n'));
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  ws.close(); child.kill(); process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

/* 复现并验证橡皮崩溃修复：
   1) 选中橡皮 → 在网格上按住移动 → 不应抛异常，UI 不能消失
   2) 橡皮点一下 = 删掉那个格子
   3) 清空后仍能继续建造（可恢复）
*/
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9339;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edge6-' + Date.now()),
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
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE });
  await sleep(1000);
  const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }
  async function click(dx, dy) {
    const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(130);
  }
  async function drag(fromDX, fromDY, toDX, toDY) {
    const a = cl(fromDX, fromDY), b = cl(toDX, toDY);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 8; i++) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8, button: 'left' });
      await sleep(30);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await sleep(150);
  }
  const TRAY = ['wood_frame', 'wood_wheel', 'iron_wheel', 'motor', 'battery', 'pump', 'pig', 'eraser'];
  const tray = n => ({ x: (1280 - (8 * 46 + 7 * 7)) / 2 + TRAY.indexOf(n) * 53 + 23, y: 720 - 76 + 23 });
  const cell = (r, c) => ({ x: (1280 / 2 - 120) + c * 40 + 20, y: 150 + r * 40 + 20 });
  const cells = () => ev(`JSON.stringify(window.__rap.state.build.cells)`);
  const out = [];

  // 建两块框
  await click(tray('wood_frame').x, tray('wood_frame').y); await click(cell(4, 1).x, cell(4, 1).y);
  await click(tray('wood_frame').x, tray('wood_frame').y); await click(cell(4, 2).x, cell(4, 2).y);
  out.push('放置后: ' + await cells());
  await shot('er-01-before');

  // 选中橡皮，在网格上按住拖动（这就是原来崩溃的操作）
  await click(tray('eraser').x, tray('eraser').y);
  await drag(cell(4, 1).x, cell(4, 1).y, cell(5, 4).x, cell(5, 4).y);
  out.push('橡皮拖动后: ' + await cells());
  out.push('页面仍存活: ' + await ev(`!!document.getElementById('cv') && window.__rap.state.phase`));
  await shot('er-02-after-erase');

  // 再点一次橡皮删掉第二块
  await click(cell(4, 2).x, cell(4, 2).y);
  out.push('再删一格: ' + await cells());

  // 继续建造（可恢复）
  await click(tray('wood_frame').x, tray('wood_frame').y); await click(cell(3, 3).x, cell(3, 3).y);
  out.push('继续建造: ' + await cells());
  await shot('er-03-recovered');

  console.log(out.join('\n'));
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  ws.close(); child.kill(); process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

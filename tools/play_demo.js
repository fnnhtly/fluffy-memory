/* 用真实浏览器（Edge headless）+ 真实鼠标/键盘事件试玩 prototype/index.html。
 * 通过 CDP 驱动：Page.navigate / Input.dispatchMouseEvent / Input.dispatchKeyEvent / Page.captureScreenshot
 * 用法：node tools/play_demo.js [--keep]
 * 截图输出到 records/shots/
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

function cdpConnect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.onopen = () => resolve({
      send(method, params) {
        return new Promise((res, rej) => {
          const mid = ++id;
          pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
        });
      },
      events,
      close() { try { ws.close(); } catch (e) {} }
    });
    ws.onerror = e => reject(new Error('ws error'));
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      } else if (msg.method) {
        events.push(msg);
      }
    };
  });
}

(async () => {
  const userDir = path.join(os.tmpdir(), 'edge-play-' + Date.now());
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + userDir,
    '--window-size=1280,800',
    '--force-device-scale-factor=1',
    '--no-first-run', '--no-default-browser-check',
    '--allow-file-access-from-files',
    'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const page = list.find(t => t.type === 'page');
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch (e) { /* 还没起来 */ }
  }
  if (!wsUrl) { console.log('FAIL: Edge CDP 未就绪'); child.kill(); process.exit(1); }

  const cdp = await cdpConnect(wsUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');

  const errors = [];
  cdp.events.forEach(() => {});
  const drain = setInterval(() => {
    while (cdp.events.length) {
      const e = cdp.events.shift();
      if (e.method === 'Runtime.exceptionThrown') {
        errors.push('EXCEPTION: ' + JSON.stringify(e.params.exceptionDetails.text) + ' ' +
          (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description || ''));
      } else if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') {
        errors.push('CONSOLE.ERROR: ' + e.params.args.map(a => a.value || a.description).join(' '));
      } else if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
        errors.push('LOG.ERROR: ' + e.params.entry.text);
      }
    }
  }, 50);

  await cdp.send('Page.navigate', { url: PAGE });
  await sleep(1500);

  // 画布在视口里的位置
  const rect = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const r = document.getElementById('cv').getBoundingClientRect();
      return JSON.stringify({left:r.left, top:r.top, width:r.width, height:r.height}); })()`,
    returnByValue: true,
  });
  const cv = JSON.parse(rect.result.value);
  console.log('canvas rect', cv);
  if (!cv.width) { console.log('FAIL: 画布尺寸为 0（页面报错？）'); }

  const toClient = (dx, dy) => ({
    x: cv.left + dx * cv.width / 1280,
    y: cv.top + dy * cv.height / 720,
  });

  async function shot(name) {
    const res = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const p = path.join(SHOTS, name + '.png');
    fs.writeFileSync(p, Buffer.from(res.data, 'base64'));
    return p;
  }
  async function clickDesign(dx, dy, button = 'left') {
    const p = toClient(dx, dy);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await sleep(40);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button, clickCount: 1 });
    await sleep(40);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button, clickCount: 1 });
    await sleep(120);
  }
  async function dragDesign(fromDX, fromDY, toDX, toDY) {
    const a = toClient(fromDX, fromDY), b = toClient(toDX, toDY);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y, button: 'none' });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
    await sleep(60);
    for (let i = 1; i <= 6; i++) {
      const x = a.x + (b.x - a.x) * i / 6, y = a.y + (b.y - a.y) * i / 6;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left' });
      await sleep(30);
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await sleep(120);
  }
  async function key(text) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text, key: text });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: text });
    await sleep(120);
  }
  const evalJS = async expr => (await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

  // ---------- 布局常量（与页面一致） ----------
  const TRAY = ['wood_frame', 'wood_wheel', 'iron_wheel', 'motor', 'battery', 'pump', 'eraser'];
  const trayCenter = i => ({ x: (1280 - (TRAY.length * 72 + (TRAY.length - 1) * 10)) / 2 + i * 82 + 36, y: 720 - 96 + 36 });
  const cellCenter = (r, c) => ({ x: (1280 / 2 - 6 * 32 / 2) + c * 32 + 16, y: (720 / 2 - 8 * 32 / 2 - 20) + r * 32 + 16 });
  const LOG = [];

  LOG.push('=== 1-1 建造：拖拽放 3 块木框 + 2 个木轮 ===');
  await shot('01-build-empty');
  // 拖拽放木框（从零件槽拖到格子）
  await dragDesign(trayCenter(0).x, trayCenter(0).y, cellCenter(4, 1).x, cellCenter(4, 1).y);
  await clickDesign(cellCenter(4, 2).x, cellCenter(4, 2).y);
  await clickDesign(cellCenter(4, 3).x, cellCenter(4, 3).y);
  // 木轮
  await dragDesign(trayCenter(1).x, trayCenter(1).y, cellCenter(5, 1).x, cellCenter(5, 1).y);
  await clickDesign(cellCenter(5, 3).x, cellCenter(5, 3).y);
  LOG.push('  建造后 HUD: ' + await evalJS(`document.title + ' | ' + (window.__lastHud || '')`));
  await shot('02-build-car');

  LOG.push('=== 发射 → 行驶 ===');
  await clickDesign(1150, 368);
  await sleep(900);
  await shot('03-run-early');
  await sleep(1600);
  await shot('04-run-mid');
  await sleep(2600);
  await shot('05-result-or-run');
  await sleep(2500);
  await shot('06-later');

  LOG.push('=== 结算：看星星 → 点重试 ===');
  await clickDesign(1280 / 2 - 170, 590);
  await sleep(600);
  await shot('07-after-retry');

  LOG.push('=== 切到 1-5，做一个长车 ===');
  await clickDesign(24 + 4 * 86 + 40, 33);   // LevelTab_5
  await sleep(400);
  await shot('08-level5');
  await clickDesign(TRAY && trayCenter(0).x, trayCenter(0).y);
  await clickDesign(cellCenter(4, 0).x, cellCenter(4, 0).y);
  await clickDesign(cellCenter(4, 1).x, cellCenter(4, 1).y);
  await clickDesign(cellCenter(4, 2).x, cellCenter(4, 2).y);
  await clickDesign(cellCenter(4, 3).x, cellCenter(4, 3).y);
  await clickDesign(trayCenter(1).x, trayCenter(1).y);
  await clickDesign(cellCenter(5, 0).x, cellCenter(5, 0).y);
  await clickDesign(cellCenter(5, 3).x, cellCenter(5, 3).y);
  await shot('09-level5-car');
  await clickDesign(1150, 368);
  await sleep(1200);
  await shot('10-level5-run');
  await sleep(2500);
  await shot('11-level5-later');

  LOG.push('=== 键盘：T 打开调参面板 ===');
  await key('t');
  await sleep(300);
  await shot('12-params');

  clearInterval(drain);
  console.log(LOG.join('\n'));
  console.log('errors:', errors.length ? errors.join('\n') : '(none)');
  console.log('shots in', SHOTS);
  if (!process.argv.includes('--keep')) {
    cdp.close();
    child.kill();
  }
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

/* 真实浏览器试玩 v2：用 window.__rap 断言"放了什么"，并把每步状态打到控制台。
 * 用法：node tools/play_demo2.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9334;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0; const pending = new Map(); const events = [];
    ws.onopen = () => resolve({
      send(m, p) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); }); },
      events, close() { try { ws.close(); } catch (e) {} }
    });
    ws.onerror = () => reject(new Error('ws'));
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
      else if (m.method) events.push(m);
    };
  });
}

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edge2-' + Date.now()),
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
  if (!wsUrl) { console.log('FAIL: CDP 未就绪'); child.kill(); process.exit(1); }
  const cdp = await connect(wsUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');

  const errors = [];
  setInterval(() => {
    while (cdp.events.length) {
      const e = cdp.events.shift();
      if (e.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text));
      if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') errors.push('ERR ' + e.params.args.map(a => a.value || a.description).join(' '));
    }
  }, 50);

  await cdp.send('Page.navigate', { url: PAGE });
  await sleep(1200);

  const ev = async expr => (await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const toClient = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function shot(n) { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }
  async function click(dx, dy, button = 'left') {
    const p = toClient(dx, dy);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button, clickCount: 1 });
    await sleep(130);
  }
  async function drag(fromDX, fromDY, toDX, toDY) {
    const a = toClient(fromDX, fromDY), b = toClient(toDX, toDY);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y, button: 'none' });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8, button: 'left' });
      await sleep(25);
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await sleep(130);
  }
  async function key(k) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: k, key: k });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k });
    await sleep(150);
  }
  const cells = () => ev(`JSON.stringify(window.__rap.state.build.cells)`);
  const phase = () => ev(`window.__rap.state.phase`);
  const runInfo = () => ev(`(()=>{const r=window.__rap.state.run; if(!r) return 'no-run';
    return JSON.stringify({ph:r.phase, x:+r.car.x.toFixed(2), y:+r.car.y.toFixed(2), vx:+r.car.vx.toFixed(2),
      stars:r.stars, box:r.boxesGot+'/'+r.boxes.length, t:+r.time.toFixed(2), energy:Math.round(r.car.energy),
      fail:r.failReason, motorUse:+r.motorUse.toFixed(1)});})()`);

  const out = [];
  const TRAY = ['wood_frame', 'wood_wheel', 'iron_wheel', 'motor', 'battery', 'pump', 'eraser'];
  const tray = i => ({ x: (1280 - (8 * 56 + 7 * 8)) / 2 + i * 64 + 28, y: 720 - 92 + 28 });
  const cell = (r, c) => ({ x: (1280 / 2 - 120) + c * 40 + 20, y: 150 + r * 40 + 20 });

  out.push('--- 1-1: 拖拽放木框 ---');
  await drag(tray(0).x, tray(0).y, cell(4, 1).x, cell(4, 1).y);
  await click(cell(4, 2).x, cell(4, 2).y);
  await click(cell(4, 3).x, cell(4, 3).y);
  out.push('  cells after frames: ' + await cells());
  await drag(tray(1).x, tray(1).y, cell(5, 1).x, cell(5, 1).y);
  await click(cell(5, 3).x, cell(5, 3).y);
  await click(tray(6).x, tray(6).y);
  await click(cell(4, 2).x, cell(4, 2).y);
  out.push('  cells after pig: ' + await cells());
  await shot('v2-01-build');

  out.push('--- 发射 ---');
  await click(812, 302);
  out.push('  phase: ' + await phase());
  await sleep(700); await shot('v2-02-run');
  out.push('  run: ' + await runInfo());
  await sleep(1500); await shot('v2-03-run');
  out.push('  run: ' + await runInfo());
  await sleep(2500); await shot('v2-04-run');
  out.push('  run: ' + await runInfo());
  await sleep(3000); await shot('v2-05-result');
  out.push('  run: ' + await runInfo() + ' phase: ' + await phase());

  out.push('--- 重试 ---');
  await click(1280 / 2 - 170, 590);
  await sleep(400);
  out.push('  phase after retry: ' + await phase() + ' cells: ' + await cells());
  await shot('v2-06-retry');

  out.push('--- 1-4 冰面（切关 + 铁轮 + 马达 + 电池） ---');
  await click(24 + 3 * 86 + 40, 33);
  await sleep(400);
  await click(tray(0).x, tray(0).y);
  for (const c of [1, 2, 3, 4]) await click(cell(4, c).x, cell(4, c).y);
  await click(tray(2).x, tray(2).y);
  await click(cell(5, 1).x, cell(5, 1).y);
  await click(cell(5, 4).x, cell(5, 4).y);
  await click(tray(3).x, tray(3).y);
  await click(cell(3, 2).x, cell(3, 2).y);
  await click(tray(4).x, tray(4).y);
  await click(cell(3, 3).x, cell(3, 3).y);
  out.push('  cells: ' + await cells());
  await shot('v2-07-ice-build');
  await click(812, 302);
  await sleep(1500); await shot('v2-08-ice-run');
  out.push('  run: ' + await runInfo());
  await sleep(3000); await shot('v2-09-ice-result');
  out.push('  run: ' + await runInfo());

  out.push('--- 参数面板 ---');
  await key('t'); await sleep(300); await shot('v2-10-params');

  console.log(out.join('\n'));
  console.log('errors:', errors.length ? errors.join(' | ') : '(none)');
  cdp.close(); child.kill(); process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

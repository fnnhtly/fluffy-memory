/* 验证零件说明面板：打开 → 点面板内部 → 关闭；再打开 → 点 ✕ → 关闭；H 键也要能开关 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9342;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edge8-' + Date.now()),
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
    await sleep(160);
  }
  async function key(k) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: k, key: k });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k });
    await sleep(160);
  }
  const open = () => ev('window.__rap.state.helpOpen');
  const out = [];
  const HELP_BTN = { x: 1280 / 2 + 150 + 38, y: 372 + 22 };

  out.push('初始 helpOpen=' + await open());
  await click(HELP_BTN.x, HELP_BTN.y);
  out.push('点按钮打开 → ' + await open());
  await shot('hh-01-open');
  await click(640, 360);                       // 点面板中间
  out.push('点面板中间 → ' + await open());
  await click(HELP_BTN.x, HELP_BTN.y);
  out.push('再打开 → ' + await open());
  await click(180 + 920 - 56 + 17, 84 + 16 + 17);   // 点 ✕
  out.push('点右上 ✕ → ' + await open());
  await key('h');
  out.push('按 H 打开 → ' + await open());
  await key('h');
  out.push('按 H 关闭 → ' + await open());
  await shot('hh-02-closed');

  console.log(out.join('\n'));
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  ws.close(); child.kill(); process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

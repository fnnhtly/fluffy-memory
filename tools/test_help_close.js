/* 零件说明面板：打开 / 点面板不误关 / ✕ 能关 / H 键来回切。
 *
 * 用户原话："零件说明关不掉"、"左上角的暂停和重来图标用不了"。
 * 这个用例的作用是把"关得掉"变成可判定的结果 —— 原来只 console.log 状态就以 exit 0 结束。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9416;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeHc-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function click(dx, dy) { const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(160); }
  async function pressKey(k) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: k, key: k });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k });
    await sleep(170); }
  const center = async expr => JSON.parse(await ev(
    `(()=>{const r=${expr};if(!r)return 'null';return JSON.stringify({x:r.x+r.w/2,y:r.y+r.h/2});})()`));
  const clickRect = async expr => { const c = await center(expr); if (!c) throw new Error('没有 ' + expr);
    await click(c.x, c.y); };
  const open = () => ev('window.__rap.state.helpOpen');

  await ev('window.__rap.state.introT=1'); await sleep(250);

  A.chk('初始是关着的', (await open()) === false);
  await clickRect("window.__rap.btnRect('help')");
  A.chk('点「零件说明」能打开', (await open()) === true);
  await shot('hh-01-open');

  // 面板上写的是「点任意处关闭 / 按 H」——就按它写的测，不按我猜的测
  await click(640, 360);
  A.chk('点面板中间就关掉（面板上写的是"点任意处关闭"）', (await open()) === false);

  await clickRect("window.__rap.btnRect('help')");
  A.chk('关掉后还能再打开', (await open()) === true);
  await click(200, 200);
  A.chk('点面板外也关掉', (await open()) === false);

  await clickRect("window.__rap.btnRect('help')");
  A.chk('第三次打开', (await open()) === true);
  // 面板右上角关闭按钮：几何取自主面板 W=920 H=540 X=(1280-920)/2 Y=84
  const cb = { x: (1280 - 920) / 2 + 920 - 56 + 17, y: 84 + 16 + 17 };
  await click(cb.x, cb.y);
  A.chk('点右上 ✕ 能关掉', (await open()) === false);
  await shot('hh-02-closed');

  await pressKey('h');
  A.chk('按 H 打开', (await open()) === true);
  await pressKey('h');
  A.chk('按 H 关闭', (await open()) === false);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

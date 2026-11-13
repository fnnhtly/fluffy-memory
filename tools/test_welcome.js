/* 欢迎引导：三页能翻完、能跳过、关了不再弹。
 *
 * 原来坐标写死 `y = 508 + 28`，而欢迎卡的按钮已经改成由 welcomeCard() 推导，
 * 那个写死的 y 早已不在按钮上 —— 但因为只 console.log 不判定，它一直"通过"。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9418;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeWc-' + Date.now()),
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
  await send('Runtime.evaluate', { expression: 'localStorage.clear()' });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
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
    await sleep(190); }
  const center = async expr => JSON.parse(await ev(
    `(()=>{const r=${expr};if(!r)return 'null';return JSON.stringify({x:r.x+r.w/2,y:r.y+r.h/2});})()`));
  const clickRect = async expr => { const c = await center(expr); if (!c) throw new Error('没有 ' + expr);
    await click(c.x, c.y); };

  const pages = await ev('window.__rap.WELCOME_PAGES ? window.__rap.WELCOME_PAGES.length : 3');

  A.chk('全新用户看到第 1 页', (await ev('window.__rap.state.welcome')) === 1);
  await shot('wc-01-page1');
  const card1 = JSON.parse(await ev('JSON.stringify(window.__rap.welcomeCard())'));
  A.chk('第 1 页是普通卡（高 306）', Math.abs(card1.h - 306) < 1,
    'h=' + card1.h.toFixed(1));

  await clickRect('window.__rap.welcomeBtnRect()');
  A.chk('点「下一步」到第 2 页', (await ev('window.__rap.state.welcome')) === 2);
  await shot('wc-02-page2');
  const card2 = JSON.parse(await ev('JSON.stringify(window.__rap.welcomeCard())'));
  A.chk('第 2 页（零件一览）卡片更高，装得下 7 行', card2.h > card1.h + 40,
    card1.h.toFixed(1) + ' → ' + card2.h.toFixed(1));
  // 按钮在两个页高下都不能跑出屏幕
  const b2 = JSON.parse(await ev('JSON.stringify(window.__rap.welcomeBtnRect())'));
  A.chk('第 2 页按钮仍在画面内', b2.y + b2.h < 720 - 8,
    'y+h=' + (b2.y + b2.h).toFixed(1));

  await clickRect('window.__rap.welcomeBtnRect()');
  A.chk('点「下一步」到第 3 页', (await ev('window.__rap.state.welcome')) === 3);
  await shot('wc-03-page3');

  await clickRect('window.__rap.welcomeBtnRect()');
  A.chk('最后一页点「开始搭车！」关闭引导', (await ev('window.__rap.state.welcome')) === 0);
  A.chk('关闭后写了 localStorage 标记',
    (await ev("localStorage.getItem('rap-welcomed-v1')")) === '1');
  await shot('wc-04-closed');

  // 刷新后不应再出现
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  A.chk('刷新后不再弹引导', (await ev('window.__rap.state.welcome')) === 0);

  // 跳过按钮：清掉标记重进，第一页直接按「跳过」
  await ev("localStorage.removeItem('rap-welcomed-v1')");
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  A.chk('清标记后引导又出现', (await ev('window.__rap.state.welcome')) === 1);
  const rev = JSON.parse(await ev('JSON.stringify(window.__rap.welcomeCard())'));
  await click((1280 - rev.w) / 2 + 12, 0);   // 先确认点空白不关（防误触）
  A.chk('点卡片外空白不会误关引导', (await ev('window.__rap.state.welcome')) === 1);
  await clickRect('window.__rap.welcomeSkipRect ? window.__rap.welcomeSkipRect() : window.__rap.welcomeBtnRect()');

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

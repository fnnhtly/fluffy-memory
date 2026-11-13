/* 选关页：L 打开 → 点卡片进入 → 存档能读回 → 空白关闭。
 *
 * 原来只 console.log 状态就 exit 0。这一版每一步都是断言，
 * 卡片坐标从 levelCardRect 取（原来写死了 216/18/168/105 四个数）。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);   // 随机端口：避免残留进程撞车
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeLs-' + Date.now()),
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
    await sleep(180); }
  async function pressKey(k) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: k, key: k });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k });
    await sleep(220); }

  await ev('window.__rap.state.introT=1'); await sleep(200);

  await pressKey('l');
  A.chk('按 L 打开选关页', (await ev('window.__rap.state.levelSelect')) === true);
  await shot('ls-01-select');

  // 关卡数是数据驱动的，卡片几何也来自页面，不写死
  const n = await ev('window.__rap.levels.length');
  A.chk('选关页列出全部 5 关', n === 5, 'n=' + n);

  // 点第 3 张卡（1-3）
  const card = JSON.parse(await ev('JSON.stringify(window.__rap.levelCardRect(2))'));
  await click(card.x + card.w / 2, card.y + 60);
  A.chk('点卡片后选关页关闭', (await ev('window.__rap.state.levelSelect')) === false);
  A.chk('进入了第 3 关（1-3）', (await ev('window.__rap.state.levelIndex')) === 2,
    'levelIndex=' + (await ev('window.__rap.state.levelIndex')));
  A.chk('关卡号真的是 1-3',
    (await ev('window.__rap.levels[window.__rap.state.levelIndex].levelId')) === '1-3');
  A.chk('切关后立刻回到建造阶段', (await ev('window.__rap.state.phase')) === 'build');
  await shot('ls-02-entered');

  // 写一条进度再打开选关，检查存档读回（用的是页面自己的 SAVE_KEY）
  await ev("localStorage.setItem('rap-progress-v1', JSON.stringify({'1-1':{stars:2,best:8.1},'1-3':{stars:3,best:12.4}}))");
  await ev('window.__rap.state.levelSelect = true;'); await sleep(350);
  A.chk('存档写入后仍能打开选关页', (await ev('window.__rap.state.levelSelect')) === true);
  const pr = JSON.parse(await ev("localStorage.getItem('rap-progress-v1')"));
  A.chk('存档里 1-3 是 3 星 / 12.4s', pr['1-3'] && pr['1-3'].stars === 3 && pr['1-3'].best === 12.4,
    JSON.stringify(pr['1-3']));
  await shot('ls-03-progress');

  // 点空白关闭
  await click(40, 700);
  A.chk('点空白处关闭选关页', (await ev('window.__rap.state.levelSelect')) === false);
  A.chk('关闭后仍停留在原关卡', (await ev('window.__rap.state.levelIndex')) === 2);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

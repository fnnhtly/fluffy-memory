/* 出发横幅：验证「发射瞬间出现 → 2 秒后消失 → 不挡任何操作」。
 * 判据全部可量化，不靠"看起来对"：
 *   1. launch 后 0.2s 横幅在（runBanner ≈ 1.8）
 *   2. 横幅期间像素确实变了（暗带画出来了），用画面平均亮度差分证明
 *   3. 2.4s 后 runBanner 归零，且画面回到干净状态
 *   4. 横幅期间点暂停仍然有效（没吃掉输入）
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeB-' + Date.now()),
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
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value;
  };
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function click(dx, dy) {
    const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(150);
  }
  const centerOf = async expr => JSON.parse(await ev(`(()=>{const r=${expr};return JSON.stringify({x:r.x+r.w/2,y:r.y+r.h/2});})()`));
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }
  // 画面平均亮度：横幅暗带会把中段压暗
  const luma = async () => await ev(`(() => {
    const cv = document.getElementById('cv'), g = cv.getContext('2d');
    const sx = cv.width / 1280, sy = cv.height / 720;
    const d = g.getImageData(0, Math.round(230 * sy), cv.width, Math.round(110 * sy)).data;
    let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 17) { s += 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2]; n++; }
    return s / n;
  })()`);

  const chk = (l, c, x) => A.chk(l, c, x);

  await ev('window.__rap.state.introT=1'); await sleep(200);

  // 摆一台最小可跑的车
  const o = JSON.parse(await ev('JSON.stringify(window.__rap.buildOrigin())'));
  const BP = await ev('window.__rap.BUILD_PX');
  const TRAY = JSON.parse(await ev('JSON.stringify(window.__rap.TRAY)'));
  const trayC = async n => {
    const r = JSON.parse(await ev(`JSON.stringify(window.__rap.trayRect(${TRAY.indexOf(n)}))`));
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };
  const place = async (part, r, c) => {
    const t = await trayC(part); await click(t.x, t.y);
    await click(o.x + c * BP + BP / 2, o.y + r * BP + BP / 2);
  };
  for (const c of [1, 2, 3]) await place('wood_frame', 4, c);
  for (const c of [1, 3]) await place('wood_wheel', 5, c);
  await place('pig', 4, 2);

  // 发射前：横幅应为 0
  chk('发射前没有横幅', (await ev('window.__rap.state.runBanner')) === 0);

  const lb = await centerOf("window.__rap.btnRect('launch')");
  await click(lb.x, lb.y);
  await sleep(200);
  const b1 = await ev('window.__rap.state.runBanner');
  chk('发射后横幅出现', b1 > 1.0 && b1 <= 2.0, 'runBanner=' + b1.toFixed(2));
  await shot('rn-01-banner');

  // 与"无横幅"的同场景对比。
  // 第一版是「等 2.4 秒后再取一次亮度」，但那时车已经开出画面了 —— 亮度差 103→202
  // 主要来自场景本身变了，不是横幅。正确做法：冻结同一帧，只翻转 runBanner。
  await ev('(()=>{const s=window.__rap.state; s.paused=true; s.runBanner=2; return 1;})()');
  await sleep(220);
  const L1 = await luma();
  await ev('window.__rap.state.runBanner=0');
  await sleep(220);
  const L2 = await luma();
  chk('横幅期间画面确实被压暗（同帧对比）', L1 < L2 - 20,
    '暗带亮度 横幅 ' + L1.toFixed(1) + ' / 无横幅 ' + L2.toFixed(1));
  await ev('window.__rap.state.runBanner=2');
  await sleep(150);
  await shot('rn-01-banner');
  await ev('window.__rap.state.paused=false');

  await sleep(2400);
  const b2 = await ev('window.__rap.state.runBanner');
  chk('2.4s 后横幅自动消失', b2 === 0, 'runBanner=' + b2);
  await shot('rn-02-after');

  // 横幅期间输入没被吃掉：重新发射并在横幅中按暂停
  await ev('window.__rap.state.phase="build"; window.__rap.state.run=null; window.__rap.launch();');
  await sleep(300);
  chk('横幅进行中', (await ev('window.__rap.state.runBanner')) > 0.8);
  const pb = await centerOf("window.__rap.btnRect('pause')");
  await click(pb.x, pb.y);
  chk('横幅期间点暂停仍有效', (await ev('window.__rap.state.paused')) === true);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

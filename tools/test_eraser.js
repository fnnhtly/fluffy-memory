/* 橡皮：拖动擦除、点擦、擦完还能继续建造，并且页面不能崩
 * （历史上橡皮传 'eraser' 给 drawPartShape 抛 TypeError，把 rAF 循环打死 → 整屏卡死）。
 *
 * 原来的版本只打印 cells 字符串并 exit 0；现在"擦掉了几个 / 还剩几个 / 页面是否还活着"都是断言。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9422;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeEr-' + Date.now()),
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
    await sleep(150); }
  async function drag(a2, b2) {
    const a = cl(a2.x, a2.y), b = cl(b2.x, b2.y);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 8; i++) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved',
        x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8, button: 'left' });
      await sleep(30);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await sleep(170); }
  const center = async expr => JSON.parse(await ev(
    `(()=>{const r=${expr};if(!r)return 'null';return JSON.stringify({x:r.x+r.w/2,y:r.y+r.h/2});})()`));

  await ev('window.__rap.state.introT=1'); await sleep(250);
  const BP = await ev('window.__rap.BUILD_PX');
  const OR = JSON.parse(await ev('JSON.stringify(window.__rap.buildOrigin())'));
  const TRAY = JSON.parse(await ev('JSON.stringify(window.__rap.TRAY)'));
  const cell = (r, c) => ({ x: OR.x + c * BP + BP / 2, y: OR.y + r * BP + BP / 2 });
  const tray = async n => center(`window.__rap.trayRect(${TRAY.indexOf(n)})`);
  async function place(part, r, c) {
    const t = await tray(part); await click(t.x, t.y);
    const q = cell(r, c); await click(q.x, q.y);
  }
  const nCells = () => ev('Object.keys(window.__rap.state.build.cells).filter(k=>window.__rap.state.build.cells[k].part).length');

  await place('wood_frame', 4, 1);
  await place('wood_frame', 4, 2);
  A.chk('先放下两块木框', (await nCells()) === 2, String(await nCells()));
  await shot('er-01-before');

  // 选中橡皮，在网格上按住拖动 —— 历史上这一步直接崩
  const e2 = await tray('eraser'); await click(e2.x, e2.y);
  A.chk('橡皮被选中', (await ev('window.__rap.state.selected')) === 'eraser');
  // 拖动路径是 (4,1) → (5,4)，线性插值会扫过路径上的若干格，
  // 所以判据是"目标格被擦掉 + 至少擦掉一个"，不是"恰好只擦一个"。
  await drag(cell(4, 1), cell(5, 4));
  A.chk('拖动擦除后页面还活着（历史上这里会崩掉整个 rAF）',
    (await ev("!!document.getElementById('cv') && window.__rap.state.phase")) === 'build');
  A.chk('拖动路径上的第一块木框被擦掉',
    (await ev("(()=>{const c=window.__rap.state.build.cells['4,1'];return c?!!c.part:false;})()")) === false);
  const afterDrag = await nCells();
  A.chk('拖动至少擦掉了一块', afterDrag < 2, '剩 ' + afterDrag + ' 块');
  await shot('er-02-after-erase');

  // 再点一下擦掉剩下的那块（逐格擦）
  const remainKey = await ev(`(()=>{const c=window.__rap.state.build.cells;
    for (const k in c) if (c[k] && c[k].part) return k; return null;})()`);
  if (remainKey) {
    const [rr, cc] = remainKey.split(',').map(Number);
    const q2 = cell(rr, cc); await click(q2.x, q2.y);
    A.chk('点一下擦掉剩下的那格', (await nCells()) === 0, '剩 ' + (await nCells()) + ' 块');
  } else {
    A.chk('拖动已经把两块都擦掉（可接受）', afterDrag === 0, '剩 ' + afterDrag + ' 块');
  }

  // 擦完还能继续建造
  await place('wood_frame', 3, 3);
  A.chk('擦完之后还能继续建造（状态没坏）', (await nCells()) === 1);
  A.chk('新零件落在正确格子',
    (await ev("(()=>{const c=window.__rap.state.build.cells['3,3'];return c?c.part:null;})()")) === 'wood_frame');
  await shot('er-03-recovered');

  // 页面持续出帧（rAF 没死）—— 这是那一类"整屏卡死"bug 的直接判据
  const f1 = await ev('window.__rap.state.frameCount || 0');
  await sleep(500);
  const f2 = await ev('window.__rap.state.frameCount || 0');
  A.chk('擦除后 rAF 仍在出帧', f2 > f1 + 5, f1 + ' → ' + f2);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

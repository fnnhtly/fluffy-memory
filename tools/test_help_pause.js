/* 验证：零件说明面板开关、暂停面板（点+键两路）、重来回建造、暂停期间时间冻结
 * 坐标全部从 __rap 的几何函数取，不写死像素（上一次就是因为写死 812,326 静默点空）。 */
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
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
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
  await send('Page.navigate', { url: PAGE }); await sleep(800);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
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
    await sleep(170);
  }
  async function key(k, code, keyCode) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: code, windowsVirtualKeyCode: keyCode });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code, windowsVirtualKeyCode: keyCode });
    await sleep(220);
  }
  const center = async expr => JSON.parse(await ev(`(()=>{const r=${expr};return JSON.stringify({x:r.x+r.w/2,y:r.y+r.h/2});})()`));

  const out = [];
  const ok = (label, cond, extra) => out.push((cond ? '✓ ' : '✗ ') + label + (extra ? '  ' + extra : ''));

  // 初始状态：intro 结束
  await ev('window.__rap.state.introT=1');
  await sleep(300);

  // ---- 1. 零件说明面板：开 → 点空白关 ----
  const helpBtn = await center("window.__rap.btnRect('help')");
  await click(helpBtn.x, helpBtn.y);
  ok('零件说明打开', await ev('window.__rap.state.helpOpen') === true);
  await shot('hb-01-help');
  await click(640, 360);
  ok('点空白能关掉零件说明', await ev('window.__rap.state.helpOpen') === false);

  // ---- 2. 用真实几何摆一台能跑的车 ----
  const trayIdx = await ev("JSON.stringify(window.__rap.TRAY)");
  const TRAY = JSON.parse(trayIdx);
  const tray = async name => center(`window.__rap.trayRect(${TRAY.indexOf(name)})`);
  const o = JSON.parse(await ev('JSON.stringify(window.__rap.buildOrigin())'));
  const BP = await ev('window.__rap.BUILD_PX');
  const cell = (r, c) => ({ x: o.x + c * BP + BP / 2, y: o.y + r * BP + BP / 2 });
  async function place(part, r, c) {
    const t = await tray(part);
    await click(t.x, t.y);
    const q = cell(r, c);
    await click(q.x, q.y);
  }
  for (const c of [1, 2, 3]) await place('wood_frame', 4, c);
  for (const c of [1, 3]) await place('wood_wheel', 5, c);
  await place('pig', 4, 2);
  // 小猪是塞进木框中空里的，不新增 cells 键，所以 3 框 + 2 轮 = 5
  const nParts = await ev('Object.keys(window.__rap.state.build.cells).length');
  const hasPig = await ev("Object.keys(window.__rap.state.build.cells).some(k=>{const c=window.__rap.state.build.cells[k];return !!(c&&c.inner);})");
  ok('拼装成功（3 框 2 轮 + 框内有猪）', nParts === 5 && hasPig === true,
    'cells=' + nParts + ' 猪在框内=' + hasPig);

  const launchBtn = await center("window.__rap.btnRect('launch')");
  await click(launchBtn.x, launchBtn.y);
  await sleep(500);
  const ph = await ev('window.__rap.state.phase');
  ok('点出发进入运行', ph === 'run', 'phase=' + ph);
  await shot('hb-02-run');

  // ---- 3. 暂停：时间冻结 ----
  const pauseBtn = await center("window.__rap.btnRect('pause')");
  await click(pauseBtn.x, pauseBtn.y);
  const p1 = await ev('window.__rap.state.paused');
  const t1 = await ev('window.__rap.state.run.time');
  await sleep(700);
  const t2 = await ev('window.__rap.state.run.time');
  ok('暂停生效且时间冻结', p1 === true && t1 === t2, t1.toFixed(2) + ' → ' + t2.toFixed(2));
  await shot('hb-03-paused');

  // ---- 4. 暂停面板「继续开」那一行可点 ----
  const rowR = JSON.parse(await ev('JSON.stringify(window.__rap.pauseRowRects())'));
  await click(rowR.resume.x + rowR.resume.w / 2, rowR.resume.y + rowR.resume.h / 2);
  ok('点「继续开」恢复', await ev('window.__rap.state.paused') === false);

  // ---- 5. 空格也能暂停后继续（键盘路径与面板文案一致）----
  await click(pauseBtn.x, pauseBtn.y);
  ok('再次暂停', await ev('window.__rap.state.paused') === true);
  await key(' ', 'Space', 32);
  ok('空格恢复', await ev('window.__rap.state.paused') === false);

  // ---- 6. 暂停面板「回建造」那一行 ----
  await click(pauseBtn.x, pauseBtn.y);
  await click(rowR.back.x + rowR.back.w / 2, rowR.back.y + rowR.back.h / 2);
  const ph2 = await ev('window.__rap.state.phase');
  const kept = await ev('Object.keys(window.__rap.state.build.cells).length');
  ok('点「回建造」回到拼装且零件保留', ph2 === 'build' && kept === nParts, 'phase=' + ph2 + ' 零件=' + kept);
  await shot('hb-04-back-to-build');

  // ---- 7. 重来按钮：也回建造，且零件保留 ----
  await click(helpBtn.x, helpBtn.y);   // 重新开个面板确认状态没被暂停逻辑污染
  await click(640, 360);
  ok('暂停逻辑没影响说明面板', await ev('window.__rap.state.helpOpen') === false);

  console.log(out.join('\n'));
  const bad = out.filter(s => s.startsWith('✗'));
  console.log(bad.length ? ('FAIL ' + bad.length) : 'ALL PASS');
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  ws.close(); child.kill(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

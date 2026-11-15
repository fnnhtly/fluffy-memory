/* 量具：在无头 Edge 里，"切走 / 切回"到底要怎么按才能真的送到事件。
 *
 * 逐项试出来的结论（这就是 test_focus_blur.js 里 hide/show 那两行的来历）：
 *   · `Page.setWebLifecycleState: frozen` 单独用 → 送 `vis:hidden`、rAF 立刻停；
 *     但 `Page.setWebLifecycleState: active` **收不回来**：hidden 一直是 true、
 *     帧数一直是 0。看起来"恢复了"，其实后面每一帧都没跑 —— 这正是第 58 轮
 *     第一版测试红了一片的原因（一堆断言读的都是停住的页面）。
 *   · `Emulation.setFocusEmulationEnabled: true` 单独用 → 送 `focus`，但
 *     `document.hidden` 一直是 false，**visibilitychange 根本不来**。
 *   · 两个一起用（切走时先关焦点模拟再 frozen，切回时先 active 再开焦点模拟）
 *     → 每一轮都送 `vis:hidden`（第 2 轮起还附带 `blur`），回来后送
 *     `vis:visible` + `focus` 并重启 rAF。连做 3 轮都成立，所以测具就钉这一对。
 */
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + os.tmpdir() + '\\edgeK-' + Date.now(),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    return r.result.value; };

  await ev(`(()=>{window.__fl=[];window.__n=0;
    document.addEventListener('visibilitychange', ()=>window.__fl.push('vis:'+document.visibilityState));
    window.addEventListener('blur', ()=>window.__fl.push('blur'));
    window.addEventListener('focus', ()=>window.__fl.push('focus'));
    const tick=()=>{window.__n++;requestAnimationFrame(tick);};requestAnimationFrame(tick);
    return true;})()`);
  const snap = async () => ev('({hidden:document.hidden,vis:document.visibilityState,frames:window.__n,log:window.__fl.slice()})');

  /* 组合 A：先关焦点模拟，再 frozen —— 看 frozen 还有没有效 */
  /* 组合 B：恢复 = active + focusEmu true */
  for (let i = 1; i <= 3; i++) {
    await ev('window.__fl=[]');
    await send('Emulation.setFocusEmulationEnabled', { enabled: false });
    await sleep(200);
    await send('Page.setWebLifecycleState', { state: 'frozen' });
    await sleep(500);
    const gone = await snap();
    await send('Page.setWebLifecycleState', { state: 'active' });
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await sleep(600);
    const back = await snap();
    console.log(`第 ${i} 轮：切走 hidden=${gone.hidden} vis=${gone.vis} log=${JSON.stringify(gone.log)} frames=${gone.frames}`);
    console.log(`        切回 hidden=${back.hidden} vis=${back.vis} log=${JSON.stringify(back.log)} frames=${back.frames}`);
  }

  ws.close();
  spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
})();

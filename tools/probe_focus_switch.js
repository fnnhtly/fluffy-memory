/* 量具：`Emulation.setFocusEmulationEnabled: true/false` 反复切 5 次，
 * 看 `blur` / `focus` 是不是每次都真的送到页面上。
 *
 * 结论（留着当证据）：会，每次都送，而且 `document.hasFocus()` 跟着变；
 * 但 `document.hidden` / `visibilityState` **一直是 visible** ——
 * 也就是说这个开关只模拟"窗口失去键盘焦点"，不模拟"标签页被藏起来"。
 *
 * 这正好对应两种真实情形：
 *   · 切到别的窗口（页面还看得见）→ 只有 blur，没有 visibilitychange；
 *   · 切到别的标签页 / 最小化（页面看不见）→ 两个都有。
 * 所以游戏里两个监听都得挂（见 index.html 的 loseFocus）。
 *
 * 另有一条也记在这里：`Page.setWebLifecycleState: active` 单独用
 * **恢复不回来**（hidden 一直是 true、rAF 一直停）。要恢复必须同时开
 * focus emulation —— 详见 probe_focus_combo.js。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + os.tmpdir() + '\\edgeJ-' + Date.now(),
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

  await ev(`(()=>{window.__fl=[];
    document.addEventListener('visibilitychange', ()=>window.__fl.push('vis:'+document.visibilityState));
    window.addEventListener('blur', ()=>window.__fl.push('blur'));
    window.addEventListener('focus', ()=>window.__fl.push('focus'));
    return true;})()`);

  /* 反复做"切走/切回"5 次，看 blur 是否每次都到 */
  const show = () => send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const hide = () => send('Emulation.setFocusEmulationEnabled', { enabled: false });

  await show();
  await sleep(300);
  console.log('建立焦点后：', JSON.stringify(await ev('window.__fl.slice()')));
  for (let i = 1; i <= 5; i++) {
    await ev('window.__fl=[]');
    await hide();
    await sleep(350);
    const gone = await ev('({log:window.__fl.slice(), hidden:document.hidden, hasFocus:document.hasFocus()})');
    await show();
    await sleep(350);
    const back = await ev('({log:window.__fl.slice(), hidden:document.hidden, hasFocus:document.hasFocus()})');
    console.log(`第 ${i} 次：切走 ${JSON.stringify(gone)}　切回 ${JSON.stringify(back)}`);
  }

  ws.close();
  spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
})();

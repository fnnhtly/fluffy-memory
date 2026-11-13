const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9433;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeDbg-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
  await ev(`(()=>{window.__keys=[];window.addEventListener('keydown',e=>window.__keys.push(e.key),true);
    const s=window.__rap.state; s.welcome=0; s.introT=1; s.phase='resolved'; s.run=window.__rap.RAP.createRun(window.__rap.level(), s.build);
    s.run.result='win'; s.resultT=1; return 1;})()`);
  await sleep(400);
  const key = async (k, code, vk) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
    await sleep(300);
  };
  await key('l', 'KeyL', 76);
  console.log('按 L 后 levelSelect =', await ev('window.__rap.state.levelSelect'));
  await key('escape', 'Escape', 27);   // 小写 key（这就是 test_result_keys 里用的写法）
  console.log('小写 escape 后 levelSelect =', await ev('window.__rap.state.levelSelect'));
  console.log('收到的按键 =', JSON.stringify(await ev('window.__keys')));
  await key('Escape', 'Escape', 27);
  console.log('大写 Escape 后 levelSelect =', await ev('window.__rap.state.levelSelect'));
  console.log('收到的按键 =', JSON.stringify(await ev('window.__keys')));
  console.log('phase =', await ev('window.__rap.state.phase'));
  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e); process.exit(1); });

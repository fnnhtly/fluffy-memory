/* 量具：无头 Edge 里 WebAudio 的哪些读数是真的可测的？
 *
 * 决定"静音"能怎么验（不能 await resume()：它的 promise 在无头里永远不 settle，
 * 上一版 probe 就是这么挂住的，只能靠 kill）。所以这里全是同步读。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeO-' + Date.now()),
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
    if (r.exceptionDetails) return { err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result.value; };

  console.log('A. state / currentTime（同步读，resume 只 fire-and-forget）：',
    JSON.stringify(await ev(`(()=>{
      const C = window.AudioContext || window.webkitAudioContext;
      const a = new C();
      a.resume();
      return {state:a.state, t:a.currentTime};
    })()`)));
  await sleep(700);
  console.log('B. 700ms 之后 currentTime 走了吗（同一对象读不到，重开一个）：',
    JSON.stringify(await ev(`(()=>{
      const C = window.AudioContext || window.webkitAudioContext;
      const a = new C(); a.resume();
      return {state:a.state, t0:a.currentTime};
    })()`)));

  console.log('C. setTargetAtTime 在 currentTime 不走时会不会到 0：',
    JSON.stringify(await ev(`(()=>{
      const C = window.AudioContext || window.webkitAudioContext;
      const a = new C();
      const g = a.createGain(); g.gain.value = 0.5;
      g.gain.setTargetAtTime(0.0, a.currentTime, 0.08);
      return {immediate: g.gain.value, t: a.currentTime};
    })()`)));
  await sleep(500);
  console.log('   ……再读同一个不行（对象没留在全局）。改用 window.__probe：',
    JSON.stringify(await ev(`(()=>{
      const C = window.AudioContext || window.webkitAudioContext;
      const a = new C();
      const g = a.createGain(); g.gain.value = 0.5;
      g.gain.setTargetAtTime(0.0, a.currentTime, 0.08);
      window.__probe = {a, g};
      return {immediate: g.gain.value, t: a.currentTime};
    })()`)));
  await sleep(600);
  console.log('   600ms 后：', JSON.stringify(await ev(`(()=>{
    const p = window.__probe;
    return {value: p.g.gain.value, t: p.a.currentTime, state: p.a.state};
  })()`)));

  console.log('D. 游戏里 createGain 的 gain.value 直接赋值可读吗（用 fxLog 触发一次 SFX.place）：',
    JSON.stringify(await ev(`(()=>{
      /* SFX 是闭包内部，不暴露。只能间接验：先看 __rap 有没有暴露 master */
      return { hasSfx: typeof window.__Sfx, rapKeys: Object.keys(window.__rap).length };
    })()`)));

  ws.close();
  spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
})();

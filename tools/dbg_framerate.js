/* 调试：浏览器里 launch() 之后，物理时间推进得比真实时间快好几倍。
 *
 * 现象：dbg_result_card 里 1.4 秒墙钟 → run.time = 12.35 秒。
 * 怀疑是 **每调一次 startLevel 就多注册一条 requestAnimationFrame 循环**
 * （底部 init 时已经注册过一次），于是 N 次 startLevel = N+1 倍速。
 *
 * 直接量 state.frameCount 的增长速率（它每帧 +1），不靠猜。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeFR-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  const framesPerSec = async (label) => {
    const a = await ev('window.__rap.state.frameCount');
    const t0 = Date.now();
    await sleep(1000);
    const b = await ev('window.__rap.state.frameCount');
    console.log(`${label}: ${((b - a) / ((Date.now() - t0) / 1000)).toFixed(1)} 帧/秒（${b - a} 帧）`);
    return b - a;
  };

  await framesPerSec('刚加载完（应 ≈ 60）');
  await ev('window.__rap.startLevel(0)');
  await framesPerSec('startLevel 一次之后');
  await ev('window.__rap.startLevel(1)');
  await framesPerSec('startLevel 两次之后');
  await ev('window.__rap.startLevel(0)');
  await framesPerSec('startLevel 三次之后');

  // 顺带看时间推进：1 秒墙钟 → run.time 涨多少
  await ev(`(()=>{const s=window.__rap.state, R=window.__rap.RAP;
    R.applySpec(window.__rap.levels[0], s.build, R.SPECS['1-1']);
    window.__rap.launch(); return 1;})()`);
  const t1 = await ev('window.__rap.state.run ? window.__rap.state.run.time : -1');
  await sleep(1000);
  const t2 = await ev('window.__rap.state.run ? window.__rap.state.run.time : -1');
  console.log(`物理时间：1 秒墙钟涨了 ${(t2 - t1).toFixed(2)} 秒（应为 ≈ 1.0）`);

  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

/* 建造页 fps：为什么"刚进关"41、"再量一次"49？
 * 两次的 zoom 完全一样（1.27），画面内容也一样。
 * 唯一可能不同的是"这一帧在图里干什么" —— 用 Chrome 自带的 CPU profiler 看。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeP5-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const profEvents = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Profiler.consoleProfileFinished') profEvents.push(m.params);
  };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Profiler.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  await send('Runtime.evaluate', { expression: "localStorage.clear();localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1500);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(1200);

  // 用 Profiler 采 3 秒建造页
  await send('Profiler.start', { samplingInterval: 200 });
  await sleep(3000);
  const prof = (await send('Profiler.stop')).profile;

  // 按函数聚合 self time
  const nodes = new Map();
  (prof.nodes || []).forEach(n => nodes.set(n.id, n));
  const selfTime = new Map();   // id -> samples count
  (prof.samples || []).forEach(sid => selfTime.set(sid, (selfTime.get(sid) || 0) + 1));
  const total = (prof.samples || []).length || 1;
  const rows = [...selfTime.entries()].map(([sid, n]) => {
    const nd = nodes.get(sid);
    return { name: (nd && nd.callFrame && (nd.callFrame.functionName || '(anon)')) || '?',
             url: (nd && nd.callFrame && nd.callFrame.url) || '',
             pct: 100 * n / total, n };
  }).sort((a, b) => b.n - a.n).slice(0, 18);

  console.log('采样总数 ' + total);
  rows.forEach(r => console.log(
    '  ' + String(r.pct.toFixed(1)).padStart(5) + '%  ' + r.name +
    (r.url ? '   [' + r.url.split('/').pop() + ']' : '')));

  send('Browser.close'); try { require('child_process')
    .spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

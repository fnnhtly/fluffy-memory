/* 页面为什么没初始化？抓到真正的异常。 */
const { spawn } = require('child_process');
const os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgeE3-' + Date.now()),
    '--window-size=1280,800', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) {
    await sleep(250);
    try {
      const l = await fetch('http://127.0.0.1:' + PORT + '/json/list').then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) ws = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const W = new WebSocket(ws);
  let id = 0; const pend = new Map(); const errs = []; const logs = [];
  await new Promise(r => { W.onopen = r; });
  W.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { res } = pend.get(m.id); pend.delete(m.id); res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errs.push((d.exception && d.exception.description) || d.text);
    } else if (m.method === 'Log.entryAdded') {
      logs.push(m.params.entry.level + ': ' + m.params.entry.text);
    }
  };
  const send = (me, p) => new Promise(res => {
    const i = ++id; pend.set(i, { res }); W.send(JSON.stringify({ id: i, method: me, params: p || {} }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.navigate', { url: PAGE });
  await sleep(3000);

  const exprs = {
    rap: 'typeof window.__rap',
    levels: 'typeof RAP_LEVELS',
    RAP: 'typeof RAP',
    cv: '!!document.getElementById("cv")'
  };
  for (const k of Object.keys(exprs)) {
    const r = await send('Runtime.evaluate', { expression: exprs[k], returnByValue: true });
    console.log(k + ' = ' + (r.result ? r.result.value : '?'));
  }
  console.log('exceptions: ' + errs.length);
  errs.slice(0, 5).forEach(e => console.log('  ' + String(e).slice(0, 400)));
  console.log('log entries: ' + logs.length);
  logs.slice(0, 5).forEach(l => console.log('  ' + l));

  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });

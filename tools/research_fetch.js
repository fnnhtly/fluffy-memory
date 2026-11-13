/* 用本机 Edge 当"取网页"的代理。
 *
 * 为什么不用 Invoke-WebRequest：这台机器直连大部分站点都超时
 * （wikipedia / fandom / r.jina.ai 全 FAIL），但 bilibili 通，
 * 而 Edge 本身有完整的网络栈。所以让浏览器去 fetch，把结果 JSON 打回来。
 *
 * 用法：
 *   node tools/research_fetch.js "<url>" [waitMs] [mode]
 *     mode = text（默认，返回 innerText）| html | json（原样返回 body 文本）
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const url = process.argv[2];
  const waitMs = Number(process.argv[3] || 2500);
  const mode = process.argv[4] || 'text';
  if (!url) { console.log('need url'); process.exit(2); }

  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgeRf-' + Date.now()),
    '--window-size=1400,1000', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', '--disable-features=IsolateOrigins,site-per-process',
    'about:blank'], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page');
      if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  if (!wsUrl) { console.log('no browser'); try { child.kill(); } catch (e) {} process.exit(1); }

  const ws = new WebSocket(wsUrl);
  let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  // 桌面 UA，别被当成爬虫
  await send('Network.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8'
  });

  try {
    await send('Page.navigate', { url });
  } catch (e) {}
  await sleep(waitMs);

  const expr = mode === 'html' ? 'document.documentElement.outerHTML'
    : mode === 'json' ? 'document.body ? document.body.innerText : ""'
    : 'document.body ? document.body.innerText : ""';
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const text = (r.result && r.result.value) || '';
  console.log(text);
  try { ws.close(); } catch (e) {}
  try {
    if (process.platform === 'win32') {
      require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else child.kill();
  } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

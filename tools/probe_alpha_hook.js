/* 在 fillText 上挂钩子，抓「拼装区」「6 × 8」这两次绘制时的 globalAlpha。 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9660 + Math.floor(Math.random() * 120);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeFT-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  // 钩子必须在 welcome 关掉之前装，但要在页面已经跑起来之后
  await ev(`(()=>{
    window.__ft=[];
    const P = CanvasRenderingContext2D.prototype;
    const o = P.fillText;
    P.fillText = function(s, x, y){
      if (typeof s === 'string' && (s.indexOf('拼装区')>=0 || s.indexOf('×')>=0 && s.length<8)) {
        window.__ft.push({s:String(s), x:Math.round(x), y:Math.round(y),
          ga:+this.globalAlpha.toFixed(3), fill:this.fillStyle,
          font:this.font});
        if (window.__ft.length > 12) window.__ft.shift();
      }
      return o.apply(this, arguments);
    };
    return 1;})()`);
  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(700);

  console.log(await ev('JSON.stringify(window.__ft, null, 1)'));
  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

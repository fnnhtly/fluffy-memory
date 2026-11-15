/* 建造页 20.5 fps：到底哪一段慢？
 *
 * 前面猜过两次都错了：
 *   1) 猜"看全图让石头循环变多" —— 实测 zoom 1.27 才 84 块，不是瓶颈；
 *   2) 猜"band() 重复调了 4 次" —— 删掉之后 fps 一点没变（20.5 → 20.5）。
 *
 * 所以这次不猜，直接**分段计时**：把 drawWorld 里每一段的耗时单独量出来。
 * 做法：在页面里给 ctx 的几个热点方法打计数器（beginPath/fill/stroke/
 * createRadialGradient/getImageData 等），跑一帧，看谁被调了几千次。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeP2-' + Date.now()),
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
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  await send('Runtime.evaluate', { expression: "localStorage.clear();localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1000);
  const ev = async e => { const r = await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value; };

  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(600);

  // 给 ctx 打计数器
  await ev(`(()=>{
    const cv=document.getElementById('cv'), g=cv.getContext('2d');
    if (window.__profInstalled) return 1;
    window.__profInstalled = true;
    window.__prof = {};
    ['beginPath','fill','stroke','fillRect','strokeRect','arc','ellipse','moveTo','lineTo',
     'createRadialGradient','createLinearGradient','getImageData','clip','fillText',
     'save','restore','setLineDash','quadraticCurveTo','roundRect'].forEach(k=>{
      const orig = g[k];
      if (typeof orig !== 'function') { window.__prof[k]={n:0,t:0,missing:true}; return; }
      window.__prof[k] = {n:0, t:0};
      g[k] = function(){ const t=performance.now(); const r=orig.apply(this, arguments);
        const p=window.__prof[k]; p.n++; p.t+=performance.now()-t; return r; };
    });
    return 1;})()`);

  // 跑 60 帧，读计数
  const prof = await ev(`(async()=>{
    Object.keys(window.__prof).forEach(k=>{window.__prof[k].n=0;window.__prof[k].t=0;});
    let n=0; const t0=performance.now();
    await new Promise(res=>{
      function f(){ n++; if(n<60) requestAnimationFrame(f); else res(); }
      requestAnimationFrame(f);
    });
    const dt = performance.now()-t0;
    const out={frames:n, ms:+dt.toFixed(0), fps:+(n/(dt/1000)).toFixed(1), calls:{}};
    Object.keys(window.__prof).forEach(k=>{
      out.calls[k]={n:window.__prof[k].n, ms:+window.__prof[k].t.toFixed(1)};
    });
    return JSON.stringify(out);})()`);

  const o = JSON.parse(prof);
  console.log('60 帧耗时 ' + o.ms + ' ms  → ' + o.fps + ' fps');
  console.log('');
  const rows = Object.keys(o.calls).map(k => ({k, ...o.calls[k]}))
    .filter(r => !r.missing && r.n > 0)
    .sort((a, b) => b.ms - a.ms);
  rows.forEach(r => console.log(
    '  ' + r.k.padEnd(22) + ' 调用 ' + String(r.n).padStart(7) +
    '  共 ' + String(r.ms).padStart(8) + ' ms'));

  // 在 build 相下量各段：先把每秒调用的次数换算成"每帧"
  console.log('');
  console.log('每帧调用次数（/60）：');
  rows.forEach(r => console.log('  ' + r.k.padEnd(22) + (r.n / 60).toFixed(0)));

  send('Browser.close'); try { require('child_process')
    .spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

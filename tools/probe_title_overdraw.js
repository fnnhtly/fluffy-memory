/* 「拼装区」到底是被后面画的东西盖住了，还是它一开始就没画亮？
 *
 * 在 fillText 钩子里**画完立刻读像素**（此时后面的绘制还没发生），
 * 再和帧末的最终像素比：
 *   · 立刻亮、最后暗  → 有东西画在它上面（层序问题），要挪位置或改绘制顺序
 *   · 立刻也暗        → 颜色/字体/alpha 本身就不够，改颜色
 */
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeAF-' + Date.now()),
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

  await ev(`(()=>{
    window.__probe = {};
    const P = CanvasRenderingContext2D.prototype;
    const o = P.fillText;
    P.fillText = function(s, x, y){
      const r = o.apply(this, arguments);
      if (s === '拼装区') {
        try {
          const m = this.measureText(s);
          const wpx = this.canvas.width / (window.__view ? window.__view.W : 1280);
          const gx = Math.round((x - 2) * wpx), gw = Math.max(4, Math.round(m.width * wpx));
          const gy = Math.round((y - 12) * wpx), gh = Math.round(14 * wpx);
          const d = this.getImageData(gx, gy, gw, gh).data;
          let mx = 0, mc = null;
          for (let i = 0; i < d.length; i += 4) {
            const l = 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
            if (l > mx) { mx = l; mc = [d[i], d[i+1], d[i+2]]; }
          }
          window.__probe.afterDraw = { maxLum: +mx.toFixed(1), rgb: mc, box: {gx,gy,gw,gh} };
        } catch (e) { window.__probe.err = String(e); }
      }
      return r;
    };
    return 1;})()`);
  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(700);

  const after = JSON.parse(await ev('JSON.stringify(window.__probe)'));

  // 帧末（rAF 之后）再读同一块
  const final = JSON.parse(await ev(`(async()=>{
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const cv=document.getElementById('cv'), g=cv.getContext('2d');
    const b=window.__probe.afterDraw.box;
    const d=g.getImageData(b.gx,b.gy,b.gw,b.gh).data;
    let mx=0,mc=null;
    for(let i=0;i<d.length;i+=4){
      const l=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
      if(l>mx){mx=l;mc=[d[i],d[i+1],d[i+2]];}
    }
    return JSON.stringify({maxLum:+mx.toFixed(1), rgb:mc});
  })()`));

  console.log('画完立刻读 :', JSON.stringify(after));
  console.log('帧末最终读 :', JSON.stringify(final));
  console.log(after.afterDraw && final.maxLum < after.afterDraw.maxLum * 0.75
    ? '=> 结论：被后面画的东西盖住了（层序问题）'
    : '=> 结论：它自己就没画亮（颜色/alpha 问题）');

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

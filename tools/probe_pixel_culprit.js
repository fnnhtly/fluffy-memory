/* 精确版：只记录 fillText('拼装区') 之后、所有「盖住那块像素」的 roundRect/fill。
 *
 * 上一版按矩形相交判断太宽（一帧里几百次 path 填充都算进去了）。
 * 这一版改成：记下标题文字的设备像素矩形，然后只在**那个矩形内部取样**，
 * 每次 fill 前后各读一个像素，谁把亮度从 205 压到 88 就是谁。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9690 + Math.floor(Math.random() * 90);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgePX-' + Date.now()),
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

  await ev(String.raw`(() => {
    const P = CanvasRenderingContext2D.prototype;
    const oFT = P.fillText;
    window.__trace = [];
    window.__armed = false;
    let box = null, lastLum = null;
    const readMax = (ctx) => {
      if (!box) return null;
      const d = ctx.getImageData(box.x, box.y, box.w, box.h).data;
      let mx = 0, mc = null;
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        if (l > mx) { mx = l; mc = [d[i], d[i + 1], d[i + 2]]; }
      }
      return { lum: +mx.toFixed(1), rgb: mc };
    };
    P.fillText = function (s, x, y) {
      const r = oFT.apply(this, arguments);
      if (s === '拼装区') {
        const wp = this.canvas.width / (window.__view ? window.__view.W : 1280);
        const m = this.measureText(s);
        box = {
          x: Math.max(0, Math.round((x - 2) * wp)),
          y: Math.max(0, Math.round((y - 13) * wp)),
          w: Math.max(4, Math.round(m.width * wp)),
          h: Math.max(4, Math.round(15 * wp))
        };
        window.__armed = true;
        window.__trace.length = 0;
        lastLum = readMax(this);
        window.__trace.push({ tag: 'fillText 拼装区', lum: lastLum.lum, rgb: lastLum.rgb, ga: this.globalAlpha, fill: this.fillStyle });
      }
      return r;
    };
    // 每一帧末读一次
    const rAF = window.requestAnimationFrame;
    window.requestAnimationFrame = function (cb) {
      return rAF.call(window, function (t) {
        cb(t);
        if (window.__armed) {
          const ctx = document.getElementById('cv').getContext('2d');
          const now = readMax(ctx);
          window.__trace.push({ tag: '帧末', lum: now.lum, rgb: now.rgb });
          window.__armed = false;
        }
      });
    };
    // 记录所有 path 填充（只记前 40 次，帧末再读）
    window.__pathLog = [];
    const oF = P.fill;
    P.fill = function () {
      const before = window.__armed && box ? readMax(this) : null;
      const r = oF.apply(this, arguments);
      if (window.__armed && box) {
        const after = readMax(this);
        if (after && before && Math.abs(after.lum - before.lum) > 6) {
          window.__pathLog.push({
            fill: typeof this.fillStyle === 'string' ? this.fillStyle : 'grad',
            ga: +this.globalAlpha.toFixed(2),
            before: before.lum, after: after.lum
          });
        }
      }
      return r;
    };
    return 1;
  })()`);
  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(1000);

  console.log('trace:', await ev('JSON.stringify(window.__trace, null, 1)'));
  console.log('谁改动了那块像素:', await ev('JSON.stringify((window.__pathLog||[]).slice(0,6), null, 1)'));

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

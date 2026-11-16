/* 是谁画在「拼装区」标题上面？
 *
 * 已经量出来了：标题画完的瞬间最亮 205，帧末只剩 88 ——
 * 说明**后面有东西盖上来**（不是颜色本身不够）。
 * 这个探针把一帧里所有经过那个矩形（设计坐标 150..300 × 160..190）
 * 的绘制调用按顺序记下来，直接看是谁。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9680 + Math.floor(Math.random() * 100);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeDO-' + Date.now()),
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
    window.__ops = [];
    window.__rec = false;
    const BOX = { x0: 150, y0: 158, x1: 300, y1: 192 };
    const hitBox = (x, y, w, h) => !(x + w < BOX.x0 || x > BOX.x1 || y + h < BOX.y0 || y > BOX.y1);
    const P = CanvasRenderingContext2D.prototype;
    let n = 0;
    const stamp = (kind, extra) => {
      if (!window.__rec) return;
      window.__ops.push(Object.assign({ i: ++n, kind: kind }, extra || {}));
      if (window.__ops.length > 300) window.__ops.shift();
    };
    const wrapRect = (name) => {
      const o = P[name];
      P[name] = function (x, y, w, h) {
        if (hitBox(x, y, w, h)) stamp(name, { x: Math.round(x), y: Math.round(y),
          w: Math.round(w), h: Math.round(h),
          fill: typeof this.fillStyle === 'string' ? this.fillStyle : 'grad',
          ga: +this.globalAlpha.toFixed(2) });
        return o.apply(this, arguments);
      };
    };
    wrapRect('fillRect'); wrapRect('strokeRect'); wrapRect('clearRect');
    wrapRect('arc');
    const oFT = P.fillText;
    P.fillText = function (s, x, y) {
      if (hitBox(x - 30, y - 12, 60, 14)) stamp('fillText', { txt: String(s).slice(0, 18),
        x: Math.round(x), y: Math.round(y),
        fill: typeof this.fillStyle === 'string' ? this.fillStyle : 'grad',
        ga: +this.globalAlpha.toFixed(2) });
      return oFT.apply(this, arguments);
    };
    const oF = P.fill, oS = P.stroke;
    P.fill = function () { stamp('fill(path)', { fill: typeof this.fillStyle === 'string' ? this.fillStyle : 'grad', ga: +this.globalAlpha.toFixed(2) }); return oF.apply(this, arguments); };
    P.stroke = function () { stamp('stroke(path)', { ga: +this.globalAlpha.toFixed(2) }); return oS.apply(this, arguments); };
    // 只录一帧（第 3 帧），避免无限增长
    const rAF = window.requestAnimationFrame;
    let frames = 0;
    window.requestAnimationFrame = function (cb) {
      return rAF.call(window, function (t) {
        frames++;
        if (frames === 3) { window.__rec = true; window.__ops.length = 0; }
        if (frames === 4) { window.__rec = false; }
        return cb(t);
      });
    };
    return 1;
  })()`);
  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(1200);

  console.log(await ev(String.raw`(() => {
    return window.__ops.map(o => '#' + o.i + ' ' + o.kind +
      (o.txt !== undefined ? ' "' + o.txt + '"' : '') +
      (o.x !== undefined && o.txt === undefined ? ' [' + o.x + ',' + o.y + ' ' + o.w + 'x' + o.h + ']' : '') +
      (o.txt !== undefined ? ' @' + o.x + ',' + o.y : '') +
      (o.fill ? ' ' + o.fill : '') + ' a=' + (o.ga !== undefined ? o.ga : '')).join('\n');
  })()`));

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

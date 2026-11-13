/* 布局审计：不靠眼睛，靠记录。
 * 注入 monkey-patch，记录「最后一帧」内所有 fillText 的包围盒，
 * 然后判定：越界 / 互相压字。这能抓到"文字压在按钮上"这类只有肉眼才发现的 bug。
 *
 * 两个关键点（第一版踩过）：
 *  1) 必须按帧切片，否则两帧的文字会互相判成重叠 → 用 ctx.clearRect 作为帧边界
 *  2) 浮层页（帮助/选关/欢迎/结算）底下还画着建造 UI，那些文字被盖住了不算重叠
 *     → 传 marker，只审计 marker 之后画的那批
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9455;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PATCH = `(() => {
  if (window.__audit) return 'already';
  const C = CanvasRenderingContext2D.prototype;
  const oText = C.fillText, oClear = C.clearRect;
  window.__audit = { recs: [] };
  // 每帧第一件事是 clearRect → 拿它当帧边界
  C.clearRect = function () { window.__audit.recs = []; return oClear.apply(this, arguments); };
  C.fillText = function (txt, x, y) {
    const m = this.measureText(String(txt));
    const sz = parseFloat((this.font.match(/(\\d+(?:\\.\\d+)?)px/) || [0, 13])[1]) || 13;
    const al = this.textAlign || 'start';
    let x0 = x;
    if (al === 'center') x0 = x - m.width / 2;
    else if (al === 'right' || al === 'end') x0 = x - m.width;
    window.__audit.recs.push({ t: String(txt), x: x0, y: y - sz * 0.78, w: m.width, h: sz, size: sz });
    return oText.apply(this, arguments);
  };
  return 'patched';
})()`;

const SNAP = `(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() =>
  res(JSON.stringify(window.__audit.recs))))))()`;

function overlapRatio(a, b) {
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ix <= 0 || iy <= 0) return 0;
  return (ix * iy) / Math.min(a.w * a.h, b.w * b.h);
}

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeA-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = list.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push(m.params.entry.text);
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async (e, awaitP) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!awaitP });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error');
    return r.result.value;
  };
  await ev(PATCH);
  await ev('window.__rap.state.introT=1');
  await sleep(250);

  const o = JSON.parse(await ev('JSON.stringify(window.__rap.buildOrigin())'));
  const BP = await ev('window.__rap.BUILD_PX');
  const TRAY = JSON.parse(await ev('JSON.stringify(window.__rap.TRAY)'));
  const cellC = (r, c) => ({ x: o.x + c * BP + BP / 2, y: o.y + r * BP + BP / 2 });
  const trayC = async name => {
    const r = JSON.parse(await ev(`JSON.stringify(window.__rap.trayRect(${TRAY.indexOf(name)}))`));
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function click(dx, dy) {
    const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(150);
  }
  const centerOf = async expr => JSON.parse(await ev(`(()=>{const r=${expr};return JSON.stringify({x:r.x+r.w/2,y:r.y+r.h/2});})()`));
  async function place(part, r, c) {
    const t = await trayC(part); await click(t.x, t.y);
    const q = cellC(r, c); await click(q.x, q.y);
  }

  let totalBad = 0;
  const all = [];

  async function audit(name, marker, box) {
    const recs = JSON.parse(await ev(SNAP, true));
    let rs = recs.filter(r => r.t.trim() && r.w > 1.5);
    if (marker) {
      const i = rs.findIndex(r => r.t.indexOf(marker) >= 0);
      if (i < 0) {
        all.push('✗ ' + name + '  找不到浮层标记「' + marker + '」——审计无效');
        totalBad++;
        return;
      }
      rs = rs.slice(i);
    }
    const bad = [];
    rs.forEach(r => {
      if (r.x < -2 || r.y < -2 || r.x + r.w > 1282 || r.y + r.h > 722) {
        bad.push('越界  「' + r.t + '」 @ ' + [r.x, r.y, r.w, r.h].map(v => Math.round(v)).join(','));
      }
    });
    // 卡片内溢出：卡内的文字不许横向跑出卡片（卡片下方的动作按钮是有意放在外面的，不检查）
    if (box) {
      rs.forEach(r => {
        const inCardVert = r.y >= box.y - 4 && r.y + r.h <= box.y + box.h + 4;
        if (!inCardVert) return;
        if (r.x < box.x - 4 || r.x + r.w > box.x + box.w + 4) {
          bad.push('出卡  「' + r.t + '」 @ x=' + Math.round(r.x) + '..' + Math.round(r.x + r.w) +
            ' / 卡 x=' + Math.round(box.x) + '..' + Math.round(box.x + box.w));
        }
      });
    }
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const k = overlapRatio(rs[i], rs[j]);
        if (k > 0.30) bad.push('压字  「' + rs[i].t + '」×「' + rs[j].t + '」 ' + k.toFixed(2));
      }
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, 'au-' + name + '.png'), Buffer.from(shot.data, 'base64'));
    totalBad += bad.length;
    const head = (bad.length ? '✗ ' : '✓ ') + name + '  文本 ' + rs.length +
      (bad.length ? '  问题 ' + bad.length : '');
    const lines = [head];
    bad.slice(0, 14).forEach(b => lines.push('    ' + b));
    if (bad.length > 14) lines.push('    ...还有 ' + (bad.length - 14) + ' 条');
    all.push(lines.join('\n'));
  }

  await audit('build');
  await audit('build-empty');

  { const hb = await centerOf("window.__rap.btnRect('help')"); await click(hb.x, hb.y); }
  await audit('help', '零件说明 —— 搭之前先知道');
  await click(640, 650); await sleep(200);

  for (const c of [1, 2, 3]) await place('wood_frame', 4, c);
  for (const c of [1, 3]) await place('wood_wheel', 5, c);
  await place('pig', 4, 2);
  await audit('build-full');

  { const lb = await centerOf("window.__rap.btnRect('launch')"); await click(lb.x, lb.y); }
  await sleep(800);
  await audit('run');

  { const pb = await centerOf("window.__rap.btnRect('pause')"); await click(pb.x, pb.y); }
  await sleep(300);
  await audit('paused', '已暂停');
  {
    const RR = JSON.parse(await ev('JSON.stringify(window.__rap.pauseRowRects())'));
    await click(RR.back.x + RR.back.w / 2, RR.back.y + RR.back.h / 2);
  }
  await sleep(300);

  await ev('window.__rap.launch()');
  await sleep(700);
  await ev('(()=>{const s=window.__rap.state; s.run.result="win"; s.run.stars=2; s.run.time=12.34; s.phase="resolved"; s.resultT=1; return 1;})()');
  await sleep(600);
  await audit('result', '到达终点');
  await ev('(()=>{const s=window.__rap.state; s.phase="build"; s.run=null; s.resultT=0; return 1;})()');
  await sleep(250);

  await ev('window.__rap.state.levelSelect=true'); await sleep(350);
  await audit('levelselect', '选择关卡');
  await ev('window.__rap.state.levelSelect=false'); await sleep(200);

  for (let p = 1; p <= 3; p++) {
    await ev(`window.__rap.state.welcome=${p}`); await sleep(350);
    const mk = ['欢迎来到', '零件一览', '跑起来之后'][p - 1];
    const box = JSON.parse(await ev('JSON.stringify(window.__rap.welcomeCard())'));
    await audit('welcome' + p, mk, box);
  }
  await ev('window.__rap.state.welcome=0'); await sleep(200);

  console.log(all.join('\n'));
  console.log('\n合计问题: ' + totalBad);
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  ws.close(); child.kill();
  // 有排版问题就以非 0 退出，verify 才能真的拦住回归
  process.exit(totalBad === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

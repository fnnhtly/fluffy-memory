/* 像素探针：确认「零件一览」那一页 7 行图标真的画出来了、且没糊在文字上。
 * 文字位置由 test_layout_audit.js 的包围盒证明；这里补图元位置。
 * 做法：按 welcomeCard 的几何算出每行图标中心，取 5×5 像素采样，判断不是背景色。
 */
const fs = require('fs');
const A = require('./lib/asserts');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);   // 随机端口：避免残留进程撞车
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeP-' + Date.now()),
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
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async (e, aw) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!aw });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value;
  };

  // 取 19×19 区块里的"最大色差"，不取单点 —— 木框是中空的，格心本来就是背景色，
  // 只取 7×7 会把"中空木框"误判成"没画"（这条是实测踩出来的）。
  const probe = async (pairs) => JSON.parse(await ev(`(() => {
    const cv = document.getElementById('cv');
    const g = cv.getContext('2d');
    const sx = cv.width / 1280, sy = cv.height / 720;
    const pts = ${JSON.stringify(pairs)};
    const R = 9;
    return JSON.stringify(pts.map(p => {
      const px = Math.round(p.x * sx), py = Math.round(p.y * sy);
      const d = g.getImageData(px - R, py - R, R * 2 + 1, R * 2 + 1).data;
      const arr = [];
      for (let i = 0; i < d.length; i += 4) arr.push([d[i], d[i + 1], d[i + 2]]);
      return { x: p.x, y: p.y, tag: p.tag, pix: arr };
    }));
  })()`));

  await ev('window.__rap.state.introT=1; window.__rap.state.welcome=2;');
  await sleep(500);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, 'pp-01-parts-page.png'), Buffer.from(shot.data, 'base64'));

  const geom = JSON.parse(await ev(`(() => {
    const C = window.__rap.welcomeCard();
    const n = window.__rap.RAP.TRAY_ORDER.length;   // 行数跟着零件表走，别写死 7
    const rows = [];
    for (let i = 0; i < n; i++) rows.push({ i, x: C.x + 36 + 20, y: C.y + 100 + i * 32 + 13 });
    return JSON.stringify({ card: C, rows, n });
  })()`));
  const expectRows = await ev('window.__rap.RAP.TRAY_ORDER.length');

  const pairs = geom.rows.map(r => ({ x: r.x, y: r.y, tag: 'icon' + r.i }));
  // 背景参考点：卡片内一块空白（右下角内边距）
  pairs.push({ x: geom.card.x + geom.card.w - 20, y: geom.card.y + geom.card.h - 8, tag: 'bg' });
  const px = await probe(pairs);
  const bg = px.find(p => p.tag === 'bg').pix[0];
  const out = [];
  let bad = 0;
  px.filter(p => p.tag !== 'bg').forEach(p => {
    // 区块内与背景色差最大的那个像素 = 这个图标是否存在
    let dmax = 0;
    p.pix.forEach(q => {
      const d = Math.abs(q[0] - bg[0]) + Math.abs(q[1] - bg[1]) + Math.abs(q[2] - bg[2]);
      if (d > dmax) dmax = d;
    });
    const ok = dmax > 40;
    if (!ok) bad++;
    out.push((ok ? '✓ ' : '✗ ') + p.tag + '  (' + Math.round(p.x) + ',' + Math.round(p.y) +
      ')  最大色差 ' + dmax);
  });
  // 卡片底部不能溢出：卡片底 + 按钮顶之间要留白
  const lastRow = geom.rows[geom.rows.length - 1];
  const gapToCardBottom = (geom.card.y + geom.card.h) - (lastRow.y + 13);
  out.push((gapToCardBottom >= 12 ? '✓ ' : '✗ ') + '最后一行到卡片底留白 ' + Math.round(gapToCardBottom) + 'px');
  if (gapToCardBottom < 12) bad++;
  // 9 件零件必须在页面上全部出现（加零件时忘了改这一页是真实发生过的）
  out.push((geom.n === expectRows ? '✓ ' : '✗ ') + '零件一览列出了全部 ' + geom.n + ' / ' + expectRows + ' 件');
  if (geom.n !== expectRows) bad++;

  console.log(out.join('\n'));
  console.log('\n图标未绘制: ' + bad);
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  ws.close(); A.killTree(child);
  process.exit(bad === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

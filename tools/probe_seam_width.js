/* 量"两块并排木框之间那条缝有多宽"——这才是用户说的"各自转动"的真正来源。
 *
 * 观察：drawPartShape 的 structure 分支给**每一格**都画完整四边框，边框宽 bw=0.22*size。
 * 两块木框左右相邻时，A 的右边框和 B 的左边框并排 → 中间出现 0.44 格的粗隔断。
 * 那看起来就是"两个独立的箱子"而不是"一个连起来的车"。
 *
 * 判据：沿两块木框的接缝取一条竖线，数"木色像素"的宽度。
 *   应该是 ~0.22 格（一块边框厚）—— 现在是 0.44 格（两块叠加）。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const PORT = 9820 + Math.floor(Math.random() * 100);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeSeam-' + Date.now()),
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

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(400);

  /* 建造期：放两块相邻木框，量接缝 */
  await ev(`(()=>{const R=window.__rap, S=R.state;
    R.startLevel(0); S.welcome=0; S.introT=1;
    ['4,1','4,2','4,3'].forEach(k => {
      const [r,c]=k.split(',').map(Number);
      S.build.cells[k] = { part:'wood_frame', dir:0 };
      S.build.order.push(k);
    });
    return 1;})()`);
  await sleep(500);

  const seam = JSON.parse(await ev(`(()=>{
    const R=window.__rap, S=R.state;
    const o=R.buildOrigin(), px=R.buildCellPx();
    const cv=document.getElementById('cv'), g=cv.getContext('2d'), v=window.__view;
    const k = cv.width / v.W;
    // 两块木框 (4,1) 与 (4,2) 的接缝在 x = o.x + 2*px
    const seamX = o.x + 2*px;
    const bandY = o.y + 4*px + px*0.5;      // 行 4 的竖直中线
    const y = Math.round((bandY - v.offY) * k);
    const x0 = Math.round((seamX - px*1.2 - v.offX) * k);
    const wSpan = Math.round(px*2.4*k);
    const d = g.getImageData(x0, y, Math.max(1,wSpan), 1).data;
    const isWood = (r,gg,b) =>
      (Math.abs(r-201)<34 && Math.abs(gg-147)<34 && Math.abs(b-84)<38) ||
      (Math.abs(r-181)<34 && Math.abs(gg-127)<34 && Math.abs(b-66)<38) ||
      (Math.abs(r-122)<34 && Math.abs(gg-79)<34 && Math.abs(b-34)<38);
    const runs = []; let start = -1;
    for (let i = 0; i < (wSpan); i++) {
      const j = i*4;
      const wd = isWood(d[j], d[j+1], d[j+2]);
      if (wd && start < 0) start = i;
      if ((!wd || i === wSpan-1) && start >= 0) {
        runs.push({ a: start, b: i, w: i-start }); start = -1;
      }
    }
    return JSON.stringify({ seamX:+seamX.toFixed(1), px:+px.toFixed(2), k,
      runs, midRun: runs.length ? runs[Math.floor(runs.length/2)] : null,
      cellW: +(px*k).toFixed(1),
      midRunInCells: runs.length ? +((runs[Math.floor(runs.length/2)].w)/k/px).toFixed(3) : null });
  })()`));
  console.log('接缝处木色横带：格宽 ' + seam.cellW + 'px（设备像素），' +
    '横带片段 ' + JSON.stringify(seam.runs));
  console.log('中间那条（就是接缝）：' + JSON.stringify(seam.midRun) +
    ' → ' + seam.midRunInCells + ' 格宽');

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

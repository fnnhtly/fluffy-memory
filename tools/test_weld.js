/* 结论探针：两块并排木框之间那条"隔断"有多宽，以及它是不是"各自转动"。
 *
 * 量出来的事实（tools/probe_seam_width.js）：
 *   · 行驶期所有结构件的角度相对车身**恒为 0**（drawPartShape 收到的 dir 全是 0，
 *     车身角度 car.a 从 -17° 变到 -25° 时三块木框一起变）—— 车**本来就是刚体**；
 *   · 但两块木框接缝处的木色横带有 **0.451 格宽**，
 *     而单块边框只有 0.22 格 —— 正好是两块边框叠在一起。
 *
 * 也就是说用户看到的"各自转动"，其实是**每条边都被画了两次**：
 * 每块木框都画完整四边框，并排时 A 的右边框 + B 的左边框并排成一道粗墙，
 * 眼睛把它读成"两个独立的箱子贴在一起"。下坡时车身一转，
 * 这条粗墙跟着转，看起来就更像"各自在转"。
 *
 * 修法：结构件只画**朝向外部**的边；相邻的边焊成一面连续的墙。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const PORT = 9840 + Math.floor(Math.random() * 100);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeSw-' + Date.now()),
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

  /* 三块木框并排（1-1 的标准解），量接缝 */
  async function seamWidth(label) {
    const r = JSON.parse(await ev(`(()=>{
      const R=window.__rap, S=R.state;
      const o=R.buildOrigin(), px=R.buildCellPx();
      const cv=document.getElementById('cv'), g=cv.getContext('2d'), v=window.__view;
      const k = cv.width / v.W;
      const seamX = o.x + 2*px;
      const y = Math.round((o.y + 4*px + px*0.5 - v.offY) * k);
      const x0 = Math.round((seamX - px*1.2 - v.offX) * k);
      const wSpan = Math.round(px*2.4*k);
      const d = g.getImageData(x0, y, Math.max(1,wSpan), 1).data;
      const isWood = (r,gg,b) =>
        (Math.abs(r-201)<34 && Math.abs(gg-147)<34 && Math.abs(b-84)<38) ||
        (Math.abs(r-181)<34 && Math.abs(gg-127)<34 && Math.abs(b-66)<38) ||
        (Math.abs(r-122)<34 && Math.abs(gg-79)<34 && Math.abs(b-34)<38);
      const runs = []; let start = -1;
      for (let i = 0; i < wSpan; i++) {
        const j = i*4;
        const wd = isWood(d[j], d[j+1], d[j+2]);
        if (wd && start < 0) start = i;
        if ((!wd || i === wSpan-1) && start >= 0) { runs.push({ a:start, b:i, w:i-start }); start = -1; }
      }
      const mid = runs.length ? runs[Math.floor(runs.length/2)] : null;
      return JSON.stringify({ runs, midW: mid ? mid.w : null,
        cellPx: px*k, inCells: mid ? +((mid.w)/(k*px)).toFixed(3) : null });
    })()`));
    A.log(label + '：木色片段 ' + JSON.stringify(r.runs) +
          '；中间那条 ' + r.midW + 'px = ' + r.inCells + ' 格');
    return r;
  }

  await ev(`(()=>{const R=window.__rap, S=R.state;
    R.startLevel(0); S.welcome=0; S.introT=1;
    ['4,1','4,2','4,3'].forEach(k => {
      S.build.cells[k] = { part:'wood_frame', dir:0 }; S.build.order.push(k);
    });
    return 1;})()`);
  await sleep(500);

  const r1 = await seamWidth('三块并排木框');

  /* 判据：接缝处的木色带必须**只有一块边框厚**（≈0.22 格），
   * 而不是两块叠起来（≈0.45 格）。
   * 上界取 0.30：比一块略宽（有外描边），但远小于两块。 */
  A.chk('A 并排木框之间的分割线只有**一块**边框厚（≤0.30 格）',
    r1.inCells !== null && r1.inCells <= 0.30,
    r1.inCells + ' 格（两块叠加是 0.45）');
  A.chk('A2 分割线也确实存在（不是把接缝整个擦掉变成一堵空墙）',
    r1.inCells !== null && r1.inCells >= 0.12, r1.inCells + ' 格');

  /* 单块木框（旁边什么都没有）仍然要画完整四边 */
  await ev(`(()=>{const S=window.__rap.state;
    S.build.cells = {}; S.build.order = [];
    S.build.cells['3,2'] = { part:'wood_frame', dir:0 }; S.build.order.push('3,2');
    return 1;})()`);
  await sleep(400);
  const solo = JSON.parse(await ev(`(()=>{
    const R=window.__rap;
    const o=R.buildOrigin(), px=R.buildCellPx();
    const cv=document.getElementById('cv'), g=cv.getContext('2d'), v=window.__view;
    const k = cv.width / v.W;
    const y = Math.round((o.y + 3*px + px*0.5 - v.offY) * k);
    const x0 = Math.round((o.x + 2*px - v.offX) * k);
    const wSpan = Math.round(px * k);
    const d = g.getImageData(x0, y, Math.max(1,wSpan), 1).data;
    const isWood = (r,gg,b) =>
      (Math.abs(r-201)<34 && Math.abs(gg-147)<34 && Math.abs(b-84)<38) ||
      (Math.abs(r-181)<34 && Math.abs(gg-127)<34 && Math.abs(b-66)<38) ||
      (Math.abs(r-122)<34 && Math.abs(gg-79)<34 && Math.abs(b-34)<38);
    let leftRun = 0, rightRun = 0, i = 0;
    while (i < wSpan && isWood(d[i*4], d[i*4+1], d[i*4+2])) { leftRun++; i++; }
    i = wSpan - 1;
    while (i >= 0 && isWood(d[i*4], d[i*4+1], d[i*4+2])) { rightRun++; i--; }
    return JSON.stringify({ leftRun, rightRun, cellPx: +(px*k).toFixed(1),
      leftCells: +(leftRun/(k*px)).toFixed(3), rightCells: +(rightRun/(k*px)).toFixed(3) });
  })()`));
  A.log('孤立的一块木框：左边框 ' + solo.leftCells + ' 格，右边框 ' + solo.rightCells + ' 格');
  A.chk('B 孤立木框仍然有**四边**（左边框存在）', solo.leftCells >= 0.12, solo.leftCells + ' 格');
  A.chk('B2 孤立木框仍然有**四边**（右边框存在）', solo.rightCells >= 0.12, solo.rightCells + ' 格');

  A.finish(ws, child);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

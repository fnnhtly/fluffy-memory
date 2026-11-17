/* 托盘只放**本关给的**零件（第 67 轮，用户要求）。
 *
 * 用户原话：「为什么本关不给的零件要显示在物品栏」。
 *
 * 原来托盘是 TRAY_ORDER 全表 + 橡皮，本关不给的画成 0 并变暗。当时理由是
 * "让玩家知道这游戏还有什么"，但它是错的：
 *   · 1-1 只要 3 件，另外 10 件永远是 0，托盘大半个是死格子；
 *   · 0 的格子仍然占位、仍然得点一下才知道没货；
 *   · 最糟的是它把**题面**藏起来了 —— 玩家看不出这关切给他哪几件工具，
 *     而那正是解谜的起点。
 *
 * 判据全部落在"托盘里到底有什么"上，不读 refreshTray 的实现：
 *   A. 每一关的托盘 = 该关 partsBox 的零件 + 橡皮，一个不多一个不少
 *   B. 托盘里不存在"数量为 0"的格子（死格子）
 *   C. 键盘数字键的槽位和画面上的槽位是同一份几何
 *   D. 换关之后托盘跟着换（不是只在 init 时算一次）
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
  const PORT = 9660 + Math.floor(Math.random() * 120);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeTr-' + Date.now()),
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
  await sleep(350);

  /* A/D. 逐关核对托盘内容 == partsBox + 橡皮 */
  let allOk = true, worst = '';
  const rows = [];
  for (let li = 0; li < 6; li++) {
    const info = JSON.parse(await ev(`(()=>{
      window.__rap.startLevel(${li});
      const R=window.__rap, S=R.state, lv=R.levels[S.levelIndex];
      const box = lv.partsBox || {};
      const expect = R.RAP.TRAY_ORDER.filter(p => (box[p]||0) > 0).concat(['eraser']);
      return JSON.stringify({ level: lv.levelId, tray: R.TRAY.slice(), expect: expect,
        boxKeys: Object.keys(box), selected: S.selected });
    })()`));
    await sleep(80);
    const same = JSON.stringify(info.tray) === JSON.stringify(info.expect);
    if (!same) { allOk = false; worst = info.level + ' 托盘=' + info.tray.join(',') +
      ' 期望=' + info.expect.join(','); }
    rows.push(info);
  }
  rows.forEach(r => A.log(r.level + '  托盘(' + r.tray.length + ')：' + r.tray.join(' · ')));
  A.chk('A1 每一关的托盘 = 该关零件箱 + 橡皮（六关全对）', allOk, worst);
  A.chk('D1 换关之后托盘确实跟着换（六关的托盘长度不全相同）',
    new Set(rows.map(r => r.tray.length)).size > 1,
    '长度集合 ' + JSON.stringify([...new Set(rows.map(r => r.tray.length))]));

  /* B. 托盘里不许有"数量为 0"的死格子 */
  const zeros = JSON.parse(await ev(`(()=>{
    const R=window.__rap, S=R.state;
    const out = [];
    for (let li=0; li<6; li++) {
      R.startLevel(li);
      R.TRAY.forEach(p => {
        if (p === 'eraser') return;
        const left = R.RAP.budgetLeft(R.level(), p, S.build);
        if (left <= 0) out.push(R.level().levelId + ':' + p + '=' + left);
      });
    }
    return JSON.stringify(out);
  })()`));
  A.log('托盘里数量为 0 的格子：' + (zeros.length ? zeros.join(', ') : '（无）'));
  A.chk('B 托盘里没有任何"数量 0"的死格子', zeros.length === 0, zeros.join(',') || '0 个');

  /* C. 键盘数字键的槽位 = 画面上的槽位（同一份 trayRect） */
  const geo = JSON.parse(await ev(`(()=>{
    window.__rap.startLevel(5);   // 1-6：8 格，最宽的一关
    const R=window.__rap;
    const rects = R.TRAY.map((p,i) => ({ p, ...R.trayRect(i) }));
    const first = rects[0], last = rects[rects.length-1];
    return JSON.stringify({ n: rects.length, rects,
      span: +(last.x + last.w - first.x).toFixed(1),
      inView: first.x > 0 && last.x + last.w < 1280 });
  })()`));
  A.log('1-6 托盘 ' + geo.n + ' 格，横跨 ' + geo.span + 'px，左右留白 ' +
        geo.rects[0].x.toFixed(0) + '/' + (1280 - (geo.rects[geo.n - 1].x + geo.rects[geo.n - 1].w)).toFixed(0));
  A.chk('C1 最宽的一关（8 格）也完整在画面内', geo.inView === true,
    geo.span + 'px');
  A.chk('C2 槽位之间不重叠', geo.rects.every((r, i) =>
    i === 0 || r.x >= geo.rects[i - 1].x + geo.rects[i - 1].w),
    '检查 ' + geo.n + ' 个矩形');
  A.chk('C3 数字键 1..9 覆盖到的槽位 = 全部槽位（都 ≤ 9 格）',
    geo.n <= 9, geo.n + ' 格');

  /* D2. 换关之后默认手里拿的是**本关第一件**，不是写死的木框 */
  const sel = JSON.parse(await ev(`(()=>{
    const R=window.__rap;
    const out = [];
    for (let li=0; li<6; li++) { R.startLevel(li); out.push(R.state.selected); }
    return JSON.stringify(out);
  })()`));
  A.log('六关进场时的默认选中：' + sel.join(' / '));
  A.chk('D2 进场默认选中的是本关托盘第一件（且都是真实存在的零件）',
    sel.every((s, i) => s === rows[i].tray[0] && !!s),
    sel.join(','));

  A.finish(ws, child);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

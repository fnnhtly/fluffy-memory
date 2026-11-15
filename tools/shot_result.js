/* 截图：结算卡（第 61 轮起右上是「+新星数」而不是金币）+ 选关页底部「满星 N / 6 关」。
 *
 * 这个脚本原来把托盘/格子的坐标**写死**了（`1280/2-138-40`、`128+r*46+23`），
 * 而建造区真正的原点是 `buildOrigin()`（`DW/2 - COLS*44/2 - 40`，y=222），
 * 格子边长也从 46 改成了 44。于是点击落到别的行上，车没造出来，
 * 发射钮也没点到（写死的 830 已经超出按钮右边界 802）——
 * 结果是"文件存下来了、里面没有结算卡"，而脚本照样打印 `phase= build`
 * 然后 exit 0。截图脚本不验内容就等于没验。
 *
 * 现在所有坐标都从 `window.__rap` 现取（`trayRect` / `cellAt` / `btnRect`），
 * 并且在存图之前先断言 `phase === 'resolved'` 且 `result === 'win'`。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeS-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
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
  await send('Runtime.evaluate', { expression: "localStorage.clear(); localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1000);
  const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();
    return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }
  async function click(dx, dy) { const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(140); }
  await ev('window.__rap.state.welcome=0; window.__rap.state.introT=1');
  await sleep(200);

  /* 坐标全部现取：不再抄一份会过期的常量。
   * 托盘按显示顺序取中心点；格子中心 = buildOrigin() + (c,r) × BUILD_PX。 */
  const tray = JSON.parse(await ev(`(()=>{const R=window.__rap;
    return JSON.stringify(R.TRAY.map((id,i)=>{const r=R.trayRect(i);
      return {id, x:r.x+r.w/2, y:r.y+r.h/2};}));})()`));
  const trayOf = id => tray.filter(t => t.id === id)[0];
  const launch = JSON.parse(await ev(`(()=>{const b=window.__rap.btnRect('launch');
    return JSON.stringify({x:b.x+b.w/2, y:b.y+b.h/2});})()`));
  const origin = JSON.parse(await ev('JSON.stringify(window.__rap.buildOrigin())'));
  const PX = await ev('window.__rap.BUILD_PX');
  /* 注意 cellAt(mx,my) 是"屏幕坐标 → 格子"，返回 {r,c} 而不是矩形；
   * 第一版拿它当矩形用，读到 undefined，JSON.parse 直接抛。 */
  const cellMid = (c, r) => ({ x: origin.x + c * PX + PX / 2, y: origin.y + r * PX + PX / 2 });
  if (!trayOf('wood_frame') || !trayOf('pig')) { console.log('FAIL 托盘坐标取不到'); process.exit(1); }

  // 1-1 的标准解：三木框（第 4 行 c1..c3）+ 两木轮（第 5 行 c1/c3）+ 猪
  await click(trayOf('wood_frame').x, trayOf('wood_frame').y);
  for (const c of [1, 2, 3]) { const p = cellMid(c, 4); await click(p.x, p.y); }
  await click(trayOf('wood_wheel').x, trayOf('wood_wheel').y);
  for (const c of [1, 3]) { const p = cellMid(c, 5); await click(p.x, p.y); }
  await click(trayOf('pig').x, trayOf('pig').y);
  await click(cellMid(2, 4).x, cellMid(2, 4).y);
  const placed = await ev('window.__rap.state.build.cells ? Object.keys(window.__rap.state.build.cells).length : -1');
  console.log('已放置格数 =', placed);
  if (!placed || placed < 1) { console.log('FAIL 一格都没放进去'); process.exit(1); }
  await shot('rs-00-build');

  await click(launch.x, launch.y);
  for (let i = 0; i < 100; i++) {
    await sleep(300);
    if (await ev('window.__rap.state.phase') === 'resolved') break;
  }
  // 回放 2.8s → 卡片滑入 → 「新星数」那格 0.55s 淡入。
  await sleep(3600);
  const res = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
    return JSON.stringify({phase:s.phase, result:s.run&&s.run.result,
      resultT:+(s.resultT||0).toFixed(2), newGoals:(s.newGoals||[]).length});})()`));
  console.log('shot 时：' + JSON.stringify(res));
  if (res.result !== 'win' || res.resultT < 1) {
    console.log('FAIL 结算卡没出来（result=' + res.result + ' resultT=' + res.resultT + '）');
    process.exit(1);
  }
  await shot('rs-01-result');

  // 选关页底部那格（原金币位）现在是「满星 N / 6 关」
  await ev(`(()=>{window.__rap.state.levelSelect=true; return 1;})()`);
  await sleep(500);
  await shot('rs-02-levelselect');
  console.log('totalStars =', await ev('window.__rap.totalStars()'));
  ws.close(); child.kill(); process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

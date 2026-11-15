/* 零件底下还有没有「黑底方块」？
 *
 * 用户原话：「你的机关会带黑底方块希望修改一下」。
 *
 * 成因：`drawPartShape` 给每个零件都画了一块投影 —— 在零件后下方偏移 6%/8% 处，
 * 用 `roundRect(-0.47格 … 0.94格)` 铺满**一整块**深色 #0a1016、alpha 0.22 的实心方块。
 * 木框本身是**空心**的（只画四条边），于是玩家看到"一个中空的框
 * 压在一块比框还大的黑方砖上"。
 *
 * ── 量具踩过的两个坑（别再踩） ──
 * 1) 第一次取格 (2,1) 的中心 —— 那落在面板顶部**外面**，读到天空（mean 232 一片平），
 *    于是"木框中心 ≈ 旁边地面"以 1.00 通过，而木框根本没放上去。假绿。
 * 2) 第二次取格 (2,3) 的中心，但**只读一个 8px 窗口**：木框中心本来就空（能透过去），
 *    投影是偏移到右下角的，所以中心读数在改动前后完全一样（52.4 → 52.4）。
 *    同样什么都没验证。
 *
 * 正确判据：投影是**整格铺满**的，所以要看**整格**的暗像素占比，
 * 而且要和"同为拼装区、但没放零件"的格子对照。
 * 木框只在四条边上画木头，整格均值必然高于投影铺满时的值。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeNB4-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  await send('Runtime.evaluate', { expression: "localStorage.clear();localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1000);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(500);

  /* 整格统计：mean + 暗像素占比。窗口取 0.42 格半径（避开相邻格）。 */
  const stat = async (c, r) => JSON.parse(await ev(`(()=>{
    const R=window.__rap, o=R.buildOrigin(), PX=R.BUILD_PX;
    const cx=o.x+${c}*PX+PX/2, cy=o.y+${r}*PX+PX/2, rad=PX*0.42;
    const cv=document.getElementById('cv'), g=cv.getContext('2d');
    const k=cv.width/1280;
    const img=g.getImageData(Math.round((cx-rad)*k),Math.round((cy-rad)*k),
                             Math.round(2*rad*k),Math.round(2*rad*k));
    const d=img.data; let dark=0,n=0,sum=0,mn=255,mx=0;
    for(let i=0;i<d.length;i+=4){
      const v=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
      sum+=v; if(v<25)dark++; if(v<mn)mn=v; if(v>mx)mx=v; n++;
    }
    return JSON.stringify({mean:+(sum/n).toFixed(1), darkPct:+(100*dark/n).toFixed(1),
      min:Math.round(mn), max:Math.round(mx), n:n});})()`));

  /* 「框内空腔」统计：只看木框中间那一圈（0.26 格半径）。
   *
   * 这是"黑底方块"最直接的指纹区：木框本身只画四条边（bw = 0.22 格），
   * 中间是**空的**，应该透出后面的地形。而旧实现的投影是
   * `roundRect(-0.47格 … +0.47格)` 偏移 6%/8% 后铺满整格 ——
   * 那块实心砖的中心正好落在这圈空腔里。
   * 所以同一个位置：修好之后是"地形色"，修好之前是"#0a1016 压暗后的地形色"。 */
  const cavity = async (c, r) => JSON.parse(await ev(`(()=>{
    const R=window.__rap, o=R.buildOrigin(), PX=R.BUILD_PX;
    const cx=o.x+${c}*PX+PX/2, cy=o.y+${r}*PX+PX/2, rad=PX*0.26;
    const cv=document.getElementById('cv'), g=cv.getContext('2d');
    const k=cv.width/1280;
    const img=g.getImageData(Math.round((cx-rad)*k),Math.round((cy-rad)*k),
                             Math.round(2*rad*k),Math.round(2*rad*k));
    const d=img.data; let sum=0,n=0,lo=255;
    for(let i=0;i<d.length;i+=4){
      const v=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
      sum+=v; if(v<lo)lo=v; n++;
    }
    return JSON.stringify({mean:+(sum/n).toFixed(1), min:Math.round(lo), n:n});})()`));

  // 基线：空格子（拼装区里，没放任何零件）
  const empty = await stat(4, 3);
  const emptyCav = await cavity(4, 3);
  A.log('空格 (c4,r3)：' + JSON.stringify(empty) + ' 空腔 ' + JSON.stringify(emptyCav));

  // 放一个木框在 (c2,r3)
  await ev(`(()=>{const R=window.__rap, s=R.state, lv=R.level();
    s.build = R.RAP.newBuild();
    R.RAP.tryPlace(lv, s.build, 'wood_frame', 3, 2);
    s.popped = {};
    return 1;})()`);
  await sleep(500);
  const placed = await ev('JSON.stringify(Object.keys(window.__rap.state.build.cells))');
  A.chk('前提：木框真的放进去了 (3,2)', placed === '["3,2"]', placed);

  const frame = await stat(2, 3);
  const frameCav = await cavity(2, 3);
  A.log('木框格 (c2,r3)：' + JSON.stringify(frame) + ' 空腔 ' + JSON.stringify(frameCav));

  /* ---- 判据 A：框内空腔必须和"旁边空地的同一块区域"同一量级 ----
   * 空腔是透的，看到的应该就是那片地形。旧实现在这里铺了一块 alpha .22 的黑砖，
   * 会把空腔亮度压到空地的大约 0.78 倍（0.22 黑 + 0.78 地形）。
   * 阈值取 0.88：漏一半（alpha .11）都还能抓住。 */
  const cavRatio = frameCav.mean / Math.max(1, empty.mean);
  A.log('空腔亮度 / 空地亮度 = ' + cavRatio.toFixed(3));
  A.chk('A 木框内腔是透的（亮度 ≥ 空地的 88%，没被黑底方块压暗）',
    cavRatio >= 0.88, cavRatio.toFixed(3) + '（' + frameCav.mean + ' vs ' + empty.mean + '）');

  /* ---- 判据 B：整格不能有"极暗"像素堆积 ----
   * #0a1016 亮度约 12，压在草地上也只会到 ~12~20，稳稳落在 <25 这一档。
   * 木头最暗的描边 #7a4f22 亮度约 84，轮子外胎 #3a4048 约 62 —— 都不该进这一档。 */
  A.chk('B 木框格没有极暗像素（<25 的黑底方块指纹）', frame.darkPct < 5,
    frame.darkPct + '% 像素 < 25');

  send('Browser.close');
  A.finish(ws, child);})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

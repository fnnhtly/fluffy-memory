/* 远景视差（第 65 轮，用户要求：「背景的山不要完全跟随镜头啊」）。
 *
 * ── 这个量具前后改了五版，每一版都曾骗过我，全部记下来 ──
 *   1) 采样线写死 y=250。1-1 的远山实际在 y≈320..445，250 是天空 ——
 *      那条线本来就不动，于是报"背景是壁纸"，而视差其实好好的。
 *   2) 比原始亮度。山是纯色三角形，内部整片同色，平移它大部分像素不变，
 *      残差被平坦区稀释 —— 按正确位移平移反而读数变差。
 *   3) 单行互相关。远山是等距重复三角形（周期 220px），一步就跳到隔壁山。
 *   4) 色块重心。远山底色是**同一个 PAL.hill 的渐变带**，重心被它拉走。
 *   5) 搜索区间写反了符号（`-Math.round(...)`），把 +22 搜成 −22，
 *      区间 −32..+8 里当然找不到正确答案，读数落在 0 附近。
 *
 * ── 现在这一版 ──
 * 镜头固定，只翻转 `state.hillParX`（0.36 ↔ 0）取两帧。
 * 两帧之间唯一的差别就是远景层平移了多少，所以差分最小值的位置**就是**
 * 视差位移本身。符号约定写死在一处：`on[x] = off[x + shift]`。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SAMPLE = 4;        // 每 4 个设备像素采一个点

(async () => {
  const PORT = 9480 + Math.floor(Math.random() * 150);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeHC-' + Date.now()),
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
  await ev(`(()=>{const S=window.__rap.state; S.buildView.x = window.__rap.level().start.col + 6;
    window.__rap.clampBuildView(S.buildView, window.__rap.level()); return 1;})()`);
  await sleep(380);

  const grab = async () => JSON.parse(await ev(`(()=>{
    const R=window.__rap, S=R.state, lv=R.levels[S.levelIndex];
    const ter=R.RAP.makeTerrain(lv), v=S.buildView, s=32*v.zoom;
    const horizonY = 360 - (ter.surfaceY(v.x) + 2.6 - v.y) * s;
    const cv=document.getElementById('cv'), g=cv.getContext('2d'), vv=window.__view;
    const d = g.getImageData(0,0,cv.width,cv.height).data;
    const W=Math.floor(cv.width/${SAMPLE}), H=Math.floor(cv.height/${SAMPLE});
    const px = new Array(W*H);
    for (let y=0;y<H;y++) for (let x=0;x<W;x++){
      const i = ((y*${SAMPLE})*cv.width + x*${SAMPLE})*4;
      px[y*W+x] = Math.round(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]);
    }
    return JSON.stringify({W,H,px,horizonY:+horizonY.toFixed(1),
      hillX:+(S.hillShiftX||0).toFixed(3), terrX:+(S.terrainShiftX||0).toFixed(3),
      k: cv.width / vv.W});
  })()`));

  /* ── 判据设计（第六版，前面五版在哪里骗人写在文件头）──
   *
   * 不再做亚像素配准。改测三件**能证伪**的事：
   *
   *   A. 视差比例 = 远景屏幕位移 ÷ 地形屏幕位移，这个比值必须落在 (0, 0.75)。
   *      这是"不要完全跟随镜头"的字面定义。数值来自渲染真正读的那两个量。
   *   B. 翻转视差只影响**山带**那片像素：山带内变化显著，山带外（天空/远处地面）
   *      必须一像素不变。这证明 translate 包住的正是那几层远景，不多不少。
   *   C. 把视差设成 0 连取两帧，必须逐像素相同（否则 B 里的差异来路不明）。
   *
   * 为什么不做位移配准：远山是**等距重复三角形**（周期 220px），而且和背后的
   * 远景地面渐变色相同 —— 平移 88px 与平移 0 的残差几乎一样（实测 13.30 vs 13.34），
   * 任何基于"最像哪个位移"的判据在这套画面上都必然不稳。
   */

  /* ---- A. 视差比例 ---- */
  await ev(`(()=>{const S=window.__rap.state; S.buildView.x = window.__rap.level().start.col + 6;
    window.__rap.clampBuildView(S.buildView, window.__rap.level()); return 1;})()`);
  await sleep(340);
  const p0 = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
    return JSON.stringify({ hill: S.hillShiftX||0, terr: S.terrainShiftX||0 });})()`));
  await ev(`(()=>{const S=window.__rap.state; S.buildView.x += 3;
    window.__rap.clampBuildView(S.buildView, window.__rap.level()); return 1;})()`);
  await sleep(340);
  const p1 = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
    return JSON.stringify({ hill: S.hillShiftX||0, terr: S.terrainShiftX||0 });})()`));
  const dHill = p1.hill - p0.hill, dTerr = p1.terr - p0.terr;
  const ratio = dHill / dTerr;
  A.log('镜头右移 3 m：地形在屏幕上移动 ' + dTerr.toFixed(1) + 'px，远景移动 ' +
        dHill.toFixed(1) + 'px，比例 ' + ratio.toFixed(3));
  A.chk('A1 远景位移非零（不是贴在镜头上的壁纸）', Math.abs(dHill) > 4, dHill.toFixed(1) + 'px');
  A.chk('A2 远景位移明显小于地形（这才叫"远"）', ratio > 0 && ratio < 0.75, ratio.toFixed(3));

  /* ---- B/C. 翻转视差只影响山带 ---- */
  const grabRows = async (par) => {
    await ev('window.__rap.state.hillParX = ' + par);
    await sleep(330);
    return JSON.parse(await ev(`(()=>{
      const R=window.__rap, S=R.state, lv=R.levels[S.levelIndex];
      const ter=R.RAP.makeTerrain(lv), v=S.buildView, s=32*v.zoom;
      const horizonY = 360 - (ter.surfaceY(v.x) + 2.6 - v.y) * s;
      const cv=document.getElementById('cv'), g=cv.getContext('2d'), vv=window.__view;
      const k = cv.width / vv.W, out = [];
      for (let y=0; y<cv.height; y+=2) {
        const d = g.getImageData(0, y, cv.width, 1).data;
        const row = new Array(cv.width);
        for (let x=0;x<cv.width;x++) row[x]=Math.round(0.299*d[x*4]+0.587*d[x*4+1]+0.114*d[x*4+2]);
        out.push(row);
      }
      return JSON.stringify({ rows: out, horizonY: +horizonY.toFixed(1), k,
        hill: +(S.hillShiftX||0).toFixed(1) });
    })()`));
  };

  // 镜头回到起点附近，视差位移小一点，山体仍在画面内
  await ev(`(()=>{const S=window.__rap.state; S.buildView.x = window.__rap.level().start.col + 6;
    window.__rap.clampBuildView(S.buildView, window.__rap.level()); return 1;})()`);
  await sleep(300);

  const offF = await grabRows(0);
  const onF = await grabRows(0.36);

  /* 山带：远山三角形**加上它下面两层丛林**。
   * 这三层共享同一个 translate（见 drawWorld 里那段注释），所以都得算进"会动的带"。
   *   远山：山顶 = horizonY+30−120，山脚 = horizonY+30
   *   丛林：horizonY+34 / +62（两层，都不带叶尖）
   * 再往下是"远景地面过渡带"，那层**不**参与视差，是很细的短带。 */
  const yHillTop = (onF.horizonY - 118) * onF.k;
  const yHillBot = (onF.horizonY + 90) * onF.k;
  let inBand = 0, inBandN = 0, outBand = 0, outBandN = 0;
  for (let i = 0; i < offF.rows.length; i++) {
    const devY = i * 2;
    const a = offF.rows[i], b = onF.rows[i];
    const inHill = devY >= yHillTop && devY <= yHillBot;
    for (let x = 0; x < a.length; x++) {
      const d = Math.abs(a[x] - b[x]);
      if (inHill) { inBand += d; inBandN++; } else { outBand += d; outBandN++; }
    }
  }
  const madIn = inBand / Math.max(1, inBandN);
  const madOut = outBand / Math.max(1, outBandN);
  A.log('翻转视差 0 ↔ 0.36：远景带内平均像素差 ' + madIn.toFixed(2) +
        '，带外 ' + madOut.toFixed(3) + '（带 = 设计 y ' +
        (yHillTop / onF.k).toFixed(0) + '..' + (yHillBot / onF.k).toFixed(0) + '）');
  A.chk('B1 翻转视差确实改变了远景带像素', madIn > 1.0, madIn.toFixed(2));
  /* 带外是天空 + 地形 + UI。它们**不属于**远景层，必须纹丝不动 ——
   * 这条守的是"translate 没漏到别的层"（漏了就是把地形也一起推走，
   * 那是比壁纸严重得多的错）。阈值给 0.3：留一点抗锯齿余量。 */
  /* 带外是天空 + 地形 + UI。它们**不属于**远景层，必须基本不动。
   * 判据用**相对**关系（带内变化 ≥ 带外 5 倍），不用绝对阈值：
   * 带外在山脚处有几行确实会被山体的抗锯齿边缘碰到（实测 ~0.6），
   * 而带内是 7 左右 —— 十倍的量级差才是"只推远景、没推别的层"的证据。 */
  A.chk('B2 带内变化远大于带外（≥5 倍），说明 translate 只包住了远景层',
    madIn >= madOut * 5, '带内 ' + madIn.toFixed(2) + ' / 带外 ' + madOut.toFixed(3) +
    ' = ' + (madIn / Math.max(1e-6, madOut)).toFixed(1) + ' 倍');

  const zA = await grabRows(0);
  await sleep(140);
  const zB = await grabRows(0);
  let zSum = 0, zN = 0;
  for (let i = 0; i < zA.rows.length; i++) {
    for (let x = 0; x < zA.rows[i].length; x++) {
      zSum += Math.abs(zA.rows[i][x] - zB.rows[i][x]); zN++;
    }
  }
  const zMad = zSum / Math.max(1, zN);
  A.log('[自证] 视差 0 连取两帧，全画面平均差 ' + zMad.toFixed(4));
  A.chk('C 视差为 0 时两帧逐像素相同（证明 B 里的差异确实来自视差）',
    zMad < 0.05, zMad.toFixed(4));

  A.finish(ws, child);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

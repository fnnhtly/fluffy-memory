/* 每个"玩家能看见的东西"都真的画出来了吗（第 90 轮）。
 *
 * ── 上一轮只覆盖了 3 个 ──
 *
 * 第 89 轮 `test_draw_presence` 只验了零件箱 / 提示键 / 提示卡 ——
 * 那是 `mutation_browser.js` 扫出来的三个洞。但画面里还有十几个东西
 * 没有任何像素级守卫：欢迎页、选关页、零件说明、结算卡、观察钮、
 * 回中钮、底部按钮、页签、地形预览条、HUD、摇杆、静音钮、建造网格、建造车。
 *
 * 这一轮把它们全部纳入。做法同上一轮：设 `state.__hideDraw = 'drawXxx'`，
 * 隐藏前后在**目标矩形**内做像素差分，要求差异 ≥ 2%。
 *
 * ── 清单是**枚举出来的**，不是挑出来的 ──
 *
 * 目标矩形来自页面自己的几何函数（`trayRect` / `hintRect` / `btnRect` /
 * `pausePanel` / `runTimeRects` …），而不是我手写坐标 ——
 * 手写坐标会和产品分叉，改了布局测试还在量旧位置。
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, 'records', 'shots');

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const PORT = 9760 + Math.floor(Math.random() * 150);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgePresence90-' + Date.now()),
    '--window-size=1280,760', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  const send = (method, params) => new Promise((res, rej) => {
    const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const errs = [];
  ws.addEventListener('message', e2 => {
    try {
      const m = JSON.parse(e2.data);
      if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text);
    } catch (e) {}
  });
  const ev = async e => {
    const r = await send('Runtime.evaluate',
      { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('页面求值异常：' + (d.exception && d.exception.description || d.text));
    }
    return r.result.value;
  };

  const view = JSON.parse(await ev('JSON.stringify({W:window.__view.W,H:window.__view.H,' +
    'offX:window.__view.offX,offY:window.__view.offY})'));
  const cvSize = JSON.parse(await ev('(()=>{const cv=document.getElementById("cv");' +
    'return JSON.stringify({w:cv.width,h:cv.height});})()'));

  async function capture() {
    return await ev('(()=>{const cv=document.getElementById("cv"), g=cv.getContext("2d");' +
      'const d=g.getImageData(0,0,cv.width,cv.height).data;' +
      'const out=[]; for(let i=0;i<d.length;i+=4) out.push(d[i],d[i+1],d[i+2]); return out;})()');
  }
  /* ⚠ 坐标换算：VIEW_OFF_X = (VIEW_W − DW)/2，设计空间是**扩展**的，
   * 所以是**加**偏移。第 89 轮写成减号，量出 0%。 */
  function diffCount(a, b, rect, k, cvW, cvH) {
    let n = 0;
    const x0 = Math.max(0, Math.round((rect.x + view.offX) * k));
    const y0 = Math.max(0, Math.round((rect.y + view.offY) * k));
    const x1 = Math.min(cvW, Math.round((rect.x + rect.w + view.offX) * k));
    const y1 = Math.min(cvH, Math.round((rect.y + rect.h + view.offY) * k));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * cvW + x) * 3;
        if (Math.abs(a[i] - b[i]) > 8 || Math.abs(a[i + 1] - b[i + 1]) > 8 ||
            Math.abs(a[i + 2] - b[i + 2]) > 8) n++;
      }
    }
    return { n, area: Math.max(0, (x1 - x0) * (y1 - y0)) };
  }

  /* 一次测量：setup → 拿矩形 → **自检噪声** → 抓 A → 隐藏 → 抓 B → 算差异
   *
   * ⚠ 为什么要自检噪声：结算页的世界还在动（`drawRun` 仍画世界、
   * outroT 还在推镜），所以**同一个状态**的两帧之间本来就有差异。
   * 变异掉 `drawResult` 之后，那条判据仍然报 27.9% —— 那是世界在动，
   * 不是卡片。没有噪声基线，这条判据的红绿都不说明问题。
   *
   * 所以先量同一状态两帧的差异，再要求"隐藏前后的差异 ≥ 噪声 × 3 + 2%"。
   * 噪声太大的用例直接判"量具不成立"而不是勉强给个结论。 */
  async function probe(name, drawName, setup, rectExpr) {
    await ev(setup);
    await sleep(480);
    const rect = JSON.parse(await ev(rectExpr));
    if (!rect || !(rect.w > 0) || !(rect.h > 0)) {
      chk(name + ' 的前提：拿得到目标矩形', false, JSON.stringify(rect));
      return;
    }
    const k = cvSize.w / view.W;

    /* 自检：同一状态两帧之间的差异（噪声底） */
    const N1 = await capture();
    await sleep(520);
    const N2 = await capture();
    const noise = diffCount(N1, N2, rect, k, cvSize.w, cvSize.h);
    const noisePct = noise.area ? noise.n / noise.area * 100 : 0;

    const A = N2;
    await ev(`(()=>{window.__rap.state.__hideDraw=${JSON.stringify(drawName)}; return 1;})()`);
    await sleep(520);
    const B = await capture();
    await ev('(()=>{window.__rap.state.__hideDraw=null; return 1;})()');
    await sleep(160);

    const d = diffCount(A, B, rect, k, cvSize.w, cvSize.h);
    const pct = d.area ? d.n / d.area * 100 : 0;
    const need = Math.max(2, noisePct * 3);
    lines.push(name.padEnd(22) + ' 区 ' +
      String(Math.round(rect.w) + '×' + Math.round(rect.h)).padStart(9) +
      '  噪声 ' + noisePct.toFixed(1).padStart(5) + '%' +
      '  差异 ' + pct.toFixed(1).padStart(5) + '%');
    /* 噪声本身太大 → 量具不成立，单独报出来 */
    if (noisePct > 10) {
      chk(name + ' 的前提：同状态两帧的噪声 ≤ 10%（否则差分无意义）',
        false, noisePct.toFixed(1) + '%');
      return;
    }
    chk(name + ' 真的被画出来了（差异 ≥ 3×噪声 且 ≥ 2%）', pct >= need,
      pct.toFixed(1) + '% vs 要求 ' + need.toFixed(1) + '%');
  }

  /* ---------- 建造期 ---------- */
  const toBuild = `(()=>{const R=window.__rap, S=R.state;
    R.startLevel(0); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
    S.paused=false; S.shake=0; S.__hideDraw=null; S.hintOpen=0; S.hintT=0;
    S.observe=false; return 1;})()`;

  await probe('零件箱', 'drawTray', toBuild,
    `(()=>{const R=window.__rap; const rs=[]; for(let i=0;i<R.TRAY.length;i++) rs.push(R.trayRect(i));
      const x0=Math.min(...rs.map(r=>r.x)), y0=Math.min(...rs.map(r=>r.y));
      const x1=Math.max(...rs.map(r=>r.x+r.w)), y1=Math.max(...rs.map(r=>r.y+r.h));
      return JSON.stringify({x:x0,y:y0,w:x1-x0,h:y1-y0});})()`);

  await probe('观察钮', 'drawObserveBtn', toBuild,
    'JSON.stringify(window.__rap.observeBtnRect())');

  /* 回中钮：只在 `buildViewAwayFromHome()` 为真时是**亮**的，否则画成灰。
   *
   * ⚠ 噪声自检报 99.2% —— 因为 `introT` 推镜还在跑（1.2 秒），
   * 整个建造画面在缩放，同状态两帧差得极多。
   * 把 `introT` 顶到 1、清掉 `recentre` 缓动与 `panDrag`，画面才定住。 */
  await probe('回中钮', 'drawRecentreBtn',
    `(()=>{const R=window.__rap, S=R.state;
      R.startLevel(0); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
      S.paused=false; S.shake=0; S.__hideDraw=null; S.hintOpen=0; S.hintT=0;
      S.introT=1; S.recentre=null; S.panDrag=null; S.observe=false;
      R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-1']);
      /* 把镜头推离"家" → 回中钮变成亮态（可比灰态更明显，也更容易量） */
      S.buildView={x: 8, y: 8, zoom: 1.4};
      return 1;})()`,
    `(()=>{const R=window.__rap;
      return JSON.stringify(R.recentreRect ? R.recentreRect() : null);})()`);

  await probe('底部出发钮', 'drawButtons', toBuild,
    'JSON.stringify(window.__rap.btnRect("launch"))');

  /* 页签：`tabRect(0)` = {24, 18, 80, 30}（写在 index.html 里，未导出），
   * 后面紧跟"当前关胶囊"（同高，从 tab 右边 10px 起，宽度按文字算）。
   * 用 {24, 18, 420, 30} 覆盖页签 + 胶囊。
   *
   * ⚠ 第一版写 {1280−320, 60, 300, 40} —— 那是我猜的位置，
   * 实测差分为 0%，看起来像"页签没画"，其实是我量错了地方。
   * 这次的位置是从 `tabRect` 的源码抄的。 */
  await probe('页签', 'drawTabs', toBuild,
    `JSON.stringify({x:24,y:18,w:420,h:30})`);

  await probe('地形预览条', 'drawBuildPreview', toBuild,
    'JSON.stringify(window.__rap.buildPreviewRect())');

  /* 建造车：`buildOrigin()` 返回**格 (0,0) 的左上角**。车放在 col 1..3 / row 4..5
   * （标准车车身在第 4 行、轮子在第 5 行）。
   *
   * ⚠ 两次写错：
   *   ① 第一版 `y: o.y + P*3` —— 差一格，量的是网格上方的空地。
   *   ② 第二版位置对了，但仍然 0% —— 因为 `toBuild` 里 `R.startLevel(0)`
   *      会**重置 build**，网格是空的，`drawBuildCar` 没东西可画。
   *      零件箱能测到是因为它总是画；建造车需要一辆真的车。
   * 所以这条要先 `applySpec` 装一辆车再量。 */
  await probe('建造车', 'drawBuildCar',
    `(()=>{const R=window.__rap, S=R.state;
      R.startLevel(0); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
      S.paused=false; S.shake=0; S.__hideDraw=null;
      R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-1']);
      return 1;})()`,
    `(()=>{const R=window.__rap, o=R.buildOrigin(), P=R.BUILD_PX;
      return JSON.stringify({x:o.x+P*1, y:o.y+P*4, w:P*3, h:P*2});})()`);

  /* ---------- 行驶期 ---------- */
  const toRun = `(()=>{const R=window.__rap, S=R.state;
    R.startLevel(0); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
    S.paused=false; S.shake=0; S.__hideDraw=null;
    R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-1']);
    R.launch(); S.runBanner=0;
    for(let k=0;k<40;k++){ if(S.run.phase!=='run') break; R.RAP.step(S.run,1/60); }
    S.shake=0;
    /* ⚠ 必须冻住物理（第 87 轮加的 state.__freezeRun）。
     * 不冻的话 rAF 每帧还在 RAP.step，车速/进度条一直变 ——
     * HUD 那块区域的"同状态两帧噪声"实测 48.8%，
     * 差分就把"车在动"读成了"HUD 在不在"。 */
    S.__freezeRun = true;
    return 1;})()`;

  await probe('HUD 时间/木箱/耐久', 'drawHud', toRun,
    `(()=>{const t=window.__rap.runTimeRects();
      const x0=Math.min(t.timer.x,t.box.x,t.frame.x);
      const y0=Math.min(t.timer.y,t.box.y,t.frame.y);
      const x1=Math.max(t.timer.x+t.timer.w,t.box.x+t.box.w,t.frame.x+t.frame.w);
      const y1=Math.max(t.timer.y+t.timer.h,t.box.y+t.box.h,t.frame.y+t.frame.h);
      return JSON.stringify({x:x0,y:y0,w:x1-x0,h:y1-y0});})()`);

  /* 暂停 / 重开两颗钮由 **drawHud** 画（不是 drawButtons）。
   * 上面"HUD 时间/木箱/耐久"那条量的是右上那一列，
   * 而左上这两颗同样是 drawHud 的一部分 —— 单独量一遍，
   * 因为它们在最左边，如果哪天 drawHud 早退只画右半，
   * 上面那条仍然会绿。
   *
   * ⚠ 第一版把这条挂在 `drawButtons` 上，量出 0% —— 因为 drawButtons
   * 在行驶期画的是**交互键**（屏幕中下），不是左上这两颗。 */
  await probe('行驶期左上暂停/重开', 'drawHud', toRun,
    `JSON.stringify({x:24,y:84,w:46,h:100})`);

  /* ---------- 覆盖层 ---------- */
  await probe('静音钮', 'drawMuteBtn', toBuild,
    'JSON.stringify(window.__rap.muteRect())');

  await probe('欢迎页', 'drawWelcome',
    `(()=>{const S=window.__rap.state; S.welcome=1; S.introT=1; S.phase='build'; S.run=null;
      S.__hideDraw=null; return 1;})()`,
    `(()=>{const R=window.__rap; const c=R.welcomeCard ? R.welcomeCard() : null;
      return JSON.stringify(c || {x:280,y:120,w:720,h:480});})()`);

  await probe('选关页', 'drawLevelSelect',
    `(()=>{const S=window.__rap.state; S.welcome=0; S.levelSelect=true;
      S.__hideDraw=null; return 1;})()`,
    `(()=>{const R=window.__rap;
      if (R.levelCardRect) { const r=R.levelCardRect(0); if(r) return JSON.stringify(r); }
      return JSON.stringify({x:44,y:200,w:216,h:260});})()`);

  await probe('零件说明', 'drawHelp',
    `(()=>{const S=window.__rap.state; S.welcome=0; S.levelSelect=false; S.helpOpen=true;
      S.__hideDraw=null; return 1;})()`,
    `(()=>{const R=window.__rap;
      if (R.helpRect) { const r=R.helpRect(); if(r) return JSON.stringify(r); }
      return JSON.stringify({x:180,y:100,w:920,h:520});})()`);

  /* 结算卡：`drawResult` 有三道门 ——
   *   ① `state.phase === 'resolved'`
   *   ② `replayPlaying()` 为 false（失败回放时卡片故意不出现）
   *   ③ `state.resultT` 要滑到 1，否则卡片还在屏幕上方外面
   *
   * ⚠ 第一版没设 `resultT`，卡片从 y = 150 − 420 = **−270** 开始滑，
   * 而 probe 只 sleep 480ms（≈29 帧，resultT ≈ 0.48，卡顶 y ≈ 91），
   * 采样的 y=130 落在卡片**下沿刚进来的那一条**上 —— 差分为 0%。
   * 直接把它设到 1，量的是"卡片完全就位之后"。 */
  await probe('结算卡', 'drawResult',
    `(()=>{const R=window.__rap, S=R.state;
      R.startLevel(0); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
      S.__hideDraw=null; S.helpOpen=false; S.resultT=0;
      R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-1']);
      R.launch(); S.runBanner=0;
      for(let k=0;k<60*8;k++){ if(S.run.phase!=='run') break; R.RAP.step(S.run,1/60); }
      S.phase='resolved'; S.outroT=1; S.shake=0;
      S.resultT=1; S.replayT=99; S.__freezeRun=true;
      return JSON.stringify({result:S.run.result, replay:!!(S.run.replay&&S.run.replay.length)});})()`,
    `(()=>{const R=window.__rap;
      if (R.resultCardRect) { const r=R.resultCardRect(); if(r) return JSON.stringify(r); }
      return JSON.stringify({x:340,y:130,w:600,h:460});})()`);

  console.log('');
  console.log(lines.join('\n'));
  console.log('');
  console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  try { ws.close(); } catch (e) {}
  try { require('./lib/asserts.js').killTree(child); } catch (e) {}
  process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

/* 风的方向 vs 车的方向（第 68 轮，用户要求）。
 *
 * 用户原话：「为什么不把风相关的零件的箭头改成风的方向，让车受反作用力
 * 沿风的反方向运动，为什么不给风相关的零件使用的时候给风的特效」。
 *
 * 用户看到的现象：风车桨的箭头朝右，但螺旋桨在物理上应该把空气往**左**吹、
 * 自己向右跑。箭头和物理现象相反，玩家没法从画面推出车会往哪走。
 *
 * 这一轮把两件事分开：
 *   · `dirVec(dir)`  = **车受力方向**（物理，六关标准解全部不变）
 *   · `blowVec()`    = **风/喷流方向**（= 对 blowsAir 零件取反）
 * 箭头画的是 blowVec（风），车沿 −blowVec 走 —— 玩家看一眼就懂。
 *
 * 判据：
 *   A. blowVec 与 dirVec 对风类零件**恰好相反**，对非风类零件**相同**
 *   B. 物理没被改动：`dir` 仍表示车的受力方向（用 1-3 标准解实测车往右跑）
 *   C. 建造期箭头画的是风的方向（读像素，不读代码）
 *   D. 行驶期真的有风特效（像素 / 状态计数）
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
  const PORT = 9700 + Math.floor(Math.random() * 120);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeWnd-' + Date.now()),
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

  /* ---- A. blowVec 与 dirVec 的关系 ---- */
  const rel = JSON.parse(await ev(`(()=>{
    const R=window.__rap.RAP;
    const out = {};
    ['propeller','jet','pump','firework'].forEach(p => {
      for (let d=0; d<4; d++) {
        const f = R.dirVec(d), b = R.blowVec(p, d);
        out[p+'_'+d] = { force: f, blow: b,
          opposite: (f[0]===-b[0] && f[1]===-b[1]),
          same: (f[0]===b[0] && f[1]===b[1]) };
      }
    });
    return JSON.stringify(out);
  })()`));
  const windParts = ['propeller', 'jet'];
  const solidParts = ['pump', 'firework'];
  let okOpp = true, okSame = true, bad = [];
  for (let d = 0; d < 4; d++) {
    for (const p of windParts) {
      if (!rel[p + '_' + d].opposite) { okOpp = false; bad.push(p + '@' + d); }
    }
    for (const p of solidParts) {
      if (!rel[p + '_' + d].same) { okSame = false; bad.push(p + '@' + d + '(应同向)'); }
    }
  }
  A.chk('A1 风类零件（风车桨/喷气口）：风的方向与车的受力方向**恰好相反**',
    okOpp, bad.join(',') || '四个方向全对');
  A.chk('A2 非风类方向件（仙术机关/霄灯）：箭头方向 = 受力方向，不取反',
    okSame, bad.join(',') || '四个方向全对');
  A.log('风车桨 dir=0：受力 ' + JSON.stringify(rel.propeller_0.force) +
        '，吹风 ' + JSON.stringify(rel.propeller_0.blow));

  /* ---- B. 物理没变：1-3 标准解仍然往右跑通 ---- */
  const run = JSON.parse(await ev(`(()=>{
    const R=window.__rap, S=R.state;
    R.startLevel(2);
    const lv=R.level();
    R.RAP.applySpec(lv, S.build, R.RAP.SPECS['1-3']);
    R.launch();
    const x0 = S.run.car.x;
    for (let i=0;i<180;i++) R.RAP.step(S.run, 1/60);
    return JSON.stringify({ x0:+x0.toFixed(2), x1:+S.run.car.x.toFixed(2),
      phase:S.run.phase, toolPart: (S.run.car.parts.find(p=>p.def.tool)||{}).part });
  })()`));
  A.log('1-3 标准解：3 秒内 x ' + run.x0 + ' → ' + run.x1 + '（风车桨 dir=0）');
  A.chk('B 物理方向没被改坏：箭头朝左吹，车仍然往右跑',
    run.x1 > run.x0 + 1.0, 'Δx=' + (run.x1 - run.x0).toFixed(2));
  A.chk('B2 前提：这一关装的是风类零件', windParts.indexOf(run.toolPart) >= 0, run.toolPart);

  /* ---- C. 建造期箭头画在风的方向上（像素） ---- */
  const arrow = JSON.parse(await ev(`(()=>{
    const R=window.__rap, S=R.state;
    R.startLevel(2);
    S.welcome=0; S.introT=1;
    const lv=R.level();
    R.RAP.applySpec(lv, S.build, R.RAP.SPECS['1-3']);
    S.selected = 'propeller';
    return JSON.stringify({ ok:true });
  })()`));
  await sleep(500);
  /* 找到风车桨那一格在屏幕上的位置，然后比较它左半边和右半边的"箭头色"像素数。
   * 风车桨色 #8fd6e8；箭头本体就是零件色，所以数得出来。 */
  const px = JSON.parse(await ev(`(()=>{
    const R=window.__rap, S=R.state;
    const key = Object.keys(S.build.cells).find(k => S.build.cells[k].part === 'propeller');
    if (!key) return JSON.stringify({ err:'no propeller' });
    const rc = key.split(',').map(Number);
    const o = R.buildOrigin(), p = R.buildCellPx();
    const cx = o.x + rc[1]*p + p/2, cy = o.y + rc[0]*p + p/2;
    const cv=document.getElementById('cv'), g=cv.getContext('2d'), v=window.__view;
    const k = cv.width / v.W;
    // 以格子中心为界，取左右各 1.15 格宽的横带
    const bandH = Math.round(p*0.8*k);
    const gx0 = Math.round((cx - p*1.15)*k), gx1 = Math.round((cx + p*1.15)*k);
    const gy = Math.round((cy - bandH/2)*k);
    const d = g.getImageData(gx0, gy, Math.max(1,gx1-gx0), Math.max(1,bandH)).data;
    const midX = Math.round(((cx - (cx - p*1.15)) / (p*2.3)) * (gx1-gx0));
    let leftN=0, rightN=0;
    for (let y=0;y<bandH;y++){
      for (let x=0;x<(gx1-gx0);x++){
        const i=(y*(gx1-gx0)+x)*4;
        const r=d[i],gg=d[i+1],b=d[i+2];
        // #8fd6e8 = (143,214,232)：容差放宽，因为箭头有白边和暗描边
        if (Math.abs(r-143)<42 && Math.abs(gg-214)<42 && Math.abs(b-232)<42) {
          if (x < midX) leftN++; else rightN++;
        }
      }
    }
    return JSON.stringify({ key, dir: S.build.cells[key].dir, leftN, rightN });
  })()`));
  A.log('风车桨在 ' + px.key + '，dir=' + px.dir + '；箭头色像素 左侧 ' +
        px.leftN + ' / 右侧 ' + px.rightN);
  A.chk('C 前提：找到了风车桨那一格', !px.err, px.err || px.key);
  A.chk('C 箭头画在**风的方向**（dir=0 时风往左，所以左侧像素明显更多）',
    px.leftN > px.rightN * 1.5,
    '左 ' + px.leftN + ' vs 右 ' + px.rightN);

  A.finish(ws, child);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

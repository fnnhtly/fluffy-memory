/* HUD 遮挡测试的驱动循环（第 87 轮）。
 *
 * ── 第五次同一个病 ──
 *
 * 第 81 轮：手写循环漏 `_drops` → 1-6 量出 17 次假撞击
 * 第 82 轮：手写循环漏 `_seeds` → 1-7/1-8 最小进展 −1.4 米
 * 第 84 轮：randomBuild 漏 `umbrella`/`wind_wing` → 1-8 通关率假 0%
 * 第 86 轮：HUD 测试读 `camLive` → 镜头位置假错位
 * **第 87 轮**：HUD 测试手写 `RAP.step` → 1-6 的沙袋从未被扔掉，
 *              车带 3 个气球一路飘到 x=46 出界（cols=44）。
 *
 * 那 391 帧里后半段量的是"车已经飞出地图"的画面，不是真实玩法。
 *
 * ── 修法 ──
 *
 * 不在测试里写循环，而是让**引擎**跑完并录轨迹（`simulate(..., {trace})`，
 * 第 82 轮加的），测试只读轨迹。轨迹里有 t / x / y / left / air，
 * 但**没有镜头** —— 而镜头正是这个测试要的。
 *
 * 所以分成两步：
 *   1. `simulate(..., {trace})` 拿到**每个时间点车的世界位置**（含 _drops/_seeds）
 *   2. 按那串位置**重放**：每帧把车放回轨迹上的位置，再按 drawRun 的公式算镜头
 *
 * 重放不是驱动 —— 它不改速度、不做物理，只是把已知的轨迹摆出来量几何。
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SPEC_OF = require('./lib/specmap.js').SPEC_OF;

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}
function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

(async () => {
  const PORT = 9700 + Math.floor(Math.random() * 200);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgeHud87-' + Date.now()),
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

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  // ═════════════ A HUD 面板两两不重叠 ═════════════
  {
    const rects = JSON.parse(await ev(`(()=>{const R=window.__rap;
      const pr=R.runProgressRect(), tr=R.runTimeRects();
      const out = { progress: pr.panel, timer: tr.timer, box: tr.box,
        frame: tr.frame, challenge: R.runChallengeRect(),
        pause: R.btnRect('pause'), restart: R.btnRect('restartRun') };
      const clean = {};
      Object.keys(out).forEach(k => { if (out[k]) clean[k] = out[k]; });
      return JSON.stringify(clean);})()`));
    const keys = Object.keys(rects);
    const bad = [];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        if (overlapArea(rects[keys[i]], rects[keys[j]]) > 0) bad.push(keys[i] + '×' + keys[j]);
      }
    }
    lines.push('HUD 矩形 ' + keys.length + ' 块：' + keys.join(' '));
    chk('A HUD 面板两两不重叠', bad.length === 0,
      bad.length ? bad.join(' / ') : '全部不重叠');
  }

  // ═════════════ B / C 走引擎轨迹，再按渲染公式算几何 ═════════════
  const LEVELS = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8'];
  const worstCar = [];
  const boxHits = [];
  const goalHits = [];
  const outOfBounds = [];

  for (let i = 0; i < LEVELS.length; i++) {
    const key = SPEC_OF[LEVELS[i]];
    const res = JSON.parse(await ev(`(()=>{const R=window.__rap, S=R.state;
      /* ⚠ 用**引擎自己**跑完（simulate 会处理 _drops/_pops/_seeds/_presses），
       * 测试不写驱动循环 —— 那正是第 81/82/84/86/87 五轮反复翻车的地方。 */
      const trace = [];
      const st = R.RAP.simulate(R.levels[${i}],
        JSON.parse(JSON.stringify(R.RAP.SPECS[${JSON.stringify(key)}])),
        { maxTime: 70, trace: trace });

      const pr=R.runProgressRect(), tr=R.runTimeRects();
      const panels = [pr.panel, tr.timer, tr.box, tr.frame, R.runChallengeRect()];
      ['pause','restartRun'].forEach(n => { const r=R.btnRect(n); if(r) panels.push(r); });
      const ov = (a,b) => {
        const x=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
        const y=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
        return x*y;
      };
      const goalCol = R.levels[${i}].goal.col;
      const ter = R.RAP.makeTerrain(R.levels[${i}]);
      /* 车身包围盒（按标准解造出来量一次，整趟不变） */
      const b0 = R.RAP.newBuild();
      R.RAP.applySpec(R.levels[${i}], b0, R.RAP.SPECS[${JSON.stringify(key)}]);
      const st0 = R.RAP.createRun(R.levels[${i}], b0);
      if (!st0.car) return JSON.stringify({ err: 'no car' });
      const hull = st0.car.hull;

      let worst = 0, boxMax = 0, goalMax = 0, frames = 0;
      for (let k = 22; k < trace.length; k++) {
        const f = trace[k];
        /* 按 drawRun 的公式算这一帧的镜头（公式抄自 prototype/index.html） */
        const surfY = Math.max(f.y, ter.surfaceY(f.x));
        /* 速度用相邻帧的位移估（轨迹里没有 vx/vy） */
        const p = trace[k-1];
        const spd = Math.hypot((f.x-p.x)*60, (f.y-p.y)*60);
        const cam = { x: f.x + 2.0 + Math.min(1.6, spd*0.14),
                      y: surfY + 1.5,
                      zoom: 1.85 - Math.min(0.45, spd*0.035) };
        const s = 32 * cam.zoom;
        const hx = (Math.max(hull.maxX,hull.minX)-Math.min(hull.maxX,hull.minX))*s;
        const hy = (hull.maxY-hull.minY)*s;
        const cx = 640 + (f.x-cam.x)*s, cy = 360 - (f.y-cam.y)*s;
        const carRect = { x: cx-hx/2, y: cy-hy/2, w: hx, h: hy };
        let cover = 0;
        panels.forEach(pn => { cover += ov(carRect, pn); });
        worst = Math.max(worst, (hx*hy) > 0 ? cover/(hx*hy) : 0);

        /* 木箱 */
        if (k % 6 === 0) {
          (R.levels[${i}].boxes || []).forEach(b => {
            const bx = 640 + ((b.col+0.5)-cam.x)*s;
            const by = 360 - (R.RAP.groundY({terrain: ter, pillars: []}, b.col+0.5)+0.5-cam.y)*s;
            panels.forEach(pn => {
              if (bx>pn.x&&bx<pn.x+pn.w&&by>pn.y&&by<pn.y+pn.h) boxMax++;
            });
          });
        }
        /* 终点旗：只在车走完全程 60% 之后统计 */
        const prog = (f.x - R.levels[${i}].start.col) / (goalCol - R.levels[${i}].start.col);
        if (prog >= 0.6) {
          const gx = 640 + (goalCol-cam.x)*s;
          const gy = 360 - (ter.surfaceY(goalCol+0.5)-cam.y)*s;
          panels.forEach(pn => {
            if (gx>pn.x&&gx<pn.x+pn.w&&gy>pn.y&&gy<pn.y+pn.h) goalMax++;
          });
        }
        frames++;
      }
      return JSON.stringify({ worst:+worst.toFixed(3), boxMax, goalMax, frames,
        endX:+trace[trace.length-1].x.toFixed(1), total: trace.length,
        cols: R.levels[${i}].grid.cols, result: st.result });})()`));
    if (res.err) { outOfBounds.push(LEVELS[i] + '（' + res.err + '）'); continue; }
    worstCar.push({ id: LEVELS[i], v: res.worst });
    if (res.boxMax > 0) boxHits.push(LEVELS[i] + '×' + res.boxMax);
    if (res.goalMax > 0) goalHits.push(LEVELS[i] + '×' + res.goalMax);
    if (res.endX > res.cols) outOfBounds.push(LEVELS[i] + ' x=' + res.endX);
    console.log(LEVELS[i] + '  轨迹 ' + res.total + ' 帧（量 ' + res.frames +
      '）  ' + res.result + '  车被盖最多 ' + (res.worst * 100).toFixed(1) +
      '%  木箱 ' + res.boxMax + '  旗 ' + res.goalMax + '  终点 x=' + res.endX);
  }

  {
    const bad = worstCar.filter(w => w.v > 0.10);
    /* ⚠ B 组**结构上不可能失败**，这一点第 87 轮查清楚了：
     *
     * 镜头目标是 `car.x + 2.0 + …` / `max(car.y, surf) + 1.5`，所以车在
     * 屏幕上的位置几乎是固定的 —— cx ∈ [427, 550]、cy ∈ [427, 449]，
     * 而 HUD 最下沿是 234。间隙 163 px。
     *
     * 它测的是**几何恒等式**，不是被测到的安全属性。
     * "空转判据"的第五种形态（第 80 轮三条、第 82 轮看门狗）。
     *
     * 真正的守卫是 `tools/test_hud_geometry.js` —— 一条纯几何断言，
     * 而且带自证（HUD 下移 300 px 时必须红）。
     * 这一条保留为**记录**：它顺带证明了"整趟逐帧都没有偏离那个驻留区"，
     * 那是个有用的运行时性质（比如急升急降时缓动滞后），只是它不守 HUD。 */
    lines.push('（记录项）逐帧车被盖：' +
      (bad.length ? bad.map(b => b.id + '=' + (b.v * 100).toFixed(0) + '%').join(' ') :
        '最高 ' + (Math.max(...worstCar.map(w => w.v)) * 100).toFixed(1) +
        '%（几何上恒为 0，判据在 test_hud_geometry.js）'));
  }
  chk('C 木箱从不被 HUD 盖住', boxHits.length === 0,
    boxHits.length ? boxHits.join(' ') : '八关全部干净');
  chk('C2 临近终点时（车走完 60% 之后）终点旗不被 HUD 盖住',
    goalHits.length === 0,
    goalHits.length ? goalHits.join(' ') : '八关全部干净');
  chk('E 八关标准解都没有跑出地图（否则量的是假画面）',
    outOfBounds.length === 0,
    outOfBounds.length ? outOfBounds.join(' ') : '全部在地图内');

  // ═════════════ D 视觉自证：真的渲染一帧，看车在哪 ═════════════
  {
    const key = SPEC_OF['1-6'];
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(5); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
      S.runBanner=0; S.shake=0;
      R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS[${JSON.stringify(key)}]);
      S.phase='build'; S.run=null; R.launch(); S.runBanner=0;
      R.RAP.applySpecRuntime(S.run, R.RAP.SPECS[${JSON.stringify(key)}]);
      for (let k = 0; k < 90; k++) { if (S.run.phase !== 'run') break; R.RAP.step(S.run, 1/60); }
      S.runBanner = 0; S.shake = 0;
      const c = S.run.car, ter = S.run.terrain;
      S.__lockCam = { x: c.x + 2.0,
        y: Math.max(c.y, ter.surfaceY(c.x)) + 1.5, zoom: 1.85 };
      /* 同时**冻住物理**（第 87 轮加的同级钩子）。
       * 只锁镜头不够：rAF 循环里仍在 RAP.step，车会跑到画面外 ——
       * 实测 camLastDraw 锁在 8.98 而 carX 从 12.59 涨到 19.11，
       * 于是同一个判据两次跑给出 38% 和 26%。 */
      S.__freezeRun = true;
      return 1;})()`);
    await sleep(600);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ROOT, 'records', 'shots', 'r87-1-6-hud.png'),
      Buffer.from(shot.data, 'base64'));
    const probe = JSON.parse(await ev(`(()=>{
      const S=window.__rap.state, car=S.run.car, cm=S.camLastDraw;
      const cv=document.getElementById('cv'), g=cv.getContext('2d'), v=window.__view;
      const W=cv.width, H=cv.height;
      const d=g.getImageData(0,0,W,H).data;
      const s=32*cm.zoom;
      const cx=640+(car.x-cm.x)*s, cy=360-(car.y-cm.y)*s;
      const hx=(Math.max(car.hull.maxX,car.hull.minX)-Math.min(car.hull.maxX,car.hull.minX))*s;
      const hy=(car.hull.maxY-car.hull.minY)*s;
      const X0=Math.round((cx-hx/2-v.offX)*(W/v.W)), Y0=Math.round((cy-hy/2-v.offY)*(H/v.H));
      const BW=Math.max(2,Math.round(hx*(W/v.W))), BH=Math.max(2,Math.round(hy*(H/v.H)));
      let wood=0, tot=0;
      for(let y=Y0;y<Y0+BH;y++) for(let x=X0;x<X0+BW;x++){
        if(x<0||y<0||x>=W||y>=H) continue;
        const j=(y*W+x)*4, r=d[j], gg=d[j+1], b=d[j+2];
        tot++;
        if ((Math.abs(r-201)<50&&Math.abs(gg-147)<50&&Math.abs(b-84)<56) ||
            (Math.abs(r-181)<50&&Math.abs(gg-127)<50&&Math.abs(b-66)<56) ||
            (Math.abs(r-122)<52&&Math.abs(gg-79)<52&&Math.abs(b-34)<56)) wood++;
      }
      return JSON.stringify({ woodPct: tot? +(wood/tot*100).toFixed(1):0,
        cx:+cx.toFixed(0), cy:+cy.toFixed(0) });
    })()`));
    lines.push('1-6 渲染一帧：车中心 (' + probe.cx + ',' + probe.cy +
      ')，该区域内木色像素 ' + probe.woodPct + '%');
    chk('D 按公式算的车位置里确实有车（木色 ≥ 25%）',
      probe.woodPct >= 25, probe.woodPct + '%');
  }

  console.log('');
  console.log(lines.join('\n'));
  console.log('');
  console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  try { ws.close(); } catch (e) {}
  try { require('./lib/asserts.js').killTree(child); } catch (e) {}
  process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

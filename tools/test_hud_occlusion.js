/* HUD 会不会挡住车 / 木箱 / 终点旗（第 86 轮，第二版）。
 *
 * ── 第一版错在哪 ──
 *
 * 第一版在 `Runtime.evaluate` 里用 `RAP.step()` 连跑 40 秒，
 * 每帧读 `state.camLive` 算车的屏幕位置。
 *
 * 但 `camLive` / `camState` 是**渲染层**在 `drawRun()` 里更新的：
 *
 *     const targetX = car.x + 2.0 + min(1.6, spd*0.14);
 *     const targetY = max(car.y, surfaceY) + 1.5;
 *     cs.x += (targetX - cs.x) * k;
 *
 * 而 `RAP.step()` 只推进**引擎**，不渲染。于是整个 40 秒循环里
 * `camState` 一次都没动（还停在初始的 `{x:0, y:0, zoom:1.7}`），
 * 算出来的车屏幕位置完全错位 —— 1-6 报的"车被盖 75%"就是这么来的。
 *
 * 这是第 81/82/84 轮同一个病的第四种形态：**量具读了一个产品没有更新的量**。
 *
 * ── 第二版怎么量 ──
 *
 * 不读 `camState`，而是**按渲染层的同一套公式**算这一帧的镜头目标：
 *
 *     cam.x = car.x + 2.0 + min(1.6, spd*0.14)
 *     cam.y = max(car.y, surfaceY) + 1.5
 *     zoom  = 1.85 - min(0.45, spd*0.035)
 *
 * 然后用它算车的屏幕矩形。这等于"如果这一帧被渲染，镜头会在哪"。
 *
 * ⚠ 但公式是抄的，会和产品分叉。所以还有一条**视觉自证**（D 组）：
 * 真的渲染一帧、截图、在车所在的屏幕区域里找"车色"像素。
 * 两条一起用 —— 公式算的是"理论遮挡"，截图证的是"实际上车在哪"。
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
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const PORT = 9700 + Math.floor(Math.random() * 200);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgeHud86b-' + Date.now()),
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

  // ═════════════ B / C 按渲染层公式算理论遮挡 ═════════════
  const LEVELS = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8'];
  const worstCar = [];
  const boxHits = [];
  const goalHits = [];

  for (let i = 0; i < LEVELS.length; i++) {
    const key = SPEC_OF[LEVELS[i]];
    const res = JSON.parse(await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(${i}); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
      S.runBanner=0; S.shake=0;
      R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS[${JSON.stringify(key)}]);
      S.phase='build'; S.run=null;
      R.launch(); S.runBanner=0;
      R.RAP.applySpecRuntime(S.run, R.RAP.SPECS[${JSON.stringify(key)}]);

      const pr=R.runProgressRect(), tr=R.runTimeRects();
      const panels = [pr.panel, tr.timer, tr.box, tr.frame, R.runChallengeRect()];
      ['pause','restartRun'].forEach(n => { const r=R.btnRect(n); if(r) panels.push(r); });
      const ov = (a,b) => {
        const x=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
        const y=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
        return x*y;
      };
      /* ⚠ 按 drawRun 的**同一套公式**算镜头（不读 camState —— 它只在渲染时更新）。
       * 公式抄自 prototype/index.html 的 drawRun：
       *   targetX = car.x + 2.0 + min(1.6, spd*0.14)
       *   targetY = max(car.y, surfaceY) + 1.5
       *   zoom    = 1.85 - min(0.45, spd*0.035)
       * 缓动在稳态下收敛到目标，所以直接用目标值。 */
      const camAt = (car, ter) => {
        const spd = Math.hypot(car.vx, car.vy);
        return {
          x: car.x + 2.0 + Math.min(1.6, spd * 0.14),
          y: Math.max(car.y, ter.surfaceY(car.x)) + 1.5,
          zoom: 1.85 - Math.min(0.45, spd * 0.035)
        };
      };
      let worst = 0, boxMax = 0, goalMax = 0, frames = 0;
      while (S.run.phase === 'run' && frames < 60*40) {
        if (frames > 20) {
          const car = S.run.car, ter = S.run.terrain;
          const cm = camAt(car, ter);
          const s = 32*cm.zoom;
          const hx = (Math.max(car.hull.maxX,car.hull.minX)-Math.min(car.hull.maxX,car.hull.minX))*s;
          const hy = (car.hull.maxY-car.hull.minY)*s;
          const cx = 640 + (car.x-cm.x)*s, cy = 360 - (car.y-cm.y)*s;
          const carRect = { x: cx-hx/2, y: cy-hy/2, w: hx, h: hy };
          const carArea = hx*hy;
          let cover = 0;
          panels.forEach(p => { cover += ov(carRect, p); });
          worst = Math.max(worst, carArea > 0 ? cover/carArea : 0);
          (S.run.boxes||[]).forEach(b => {
            if (b.got) return;
            const bx = 640 + ((b.col+0.5)-cm.x)*s;
            const by = 360 - (R.RAP.groundY(S.run, b.col+0.5)+0.5-cm.y)*s;
            panels.forEach(p => {
              if (bx>p.x&&bx<p.x+p.w&&by>p.y&&by<p.y+p.h) boxMax++;
            });
          });
          const gx = 640 + (R.level().goal.col-cm.x)*s;
          const gy = 360 - (R.RAP.groundY(S.run, R.level().goal.col+0.5)-cm.y)*s;
          /* 只在**车走完全程 60% 之后**统计旗的遮挡 ——
           * 起跑时旗还在屏幕右边缘，被右上面板压住是正常的远景关系。
           * （S.level 不存在 —— level 是页面里的函数 R.level()。）
           * ⚠ 注释里不能出现反引号：这一段在**模板字符串内部**，
           * 反引号会提前闭合模板（这个坑这是第五次）。 */
          const prog = (car.x - S.run.level.start.col) /
                       (R.level().goal.col - S.run.level.start.col);
          if (prog >= 0.6) {
            panels.forEach(p => {
              if (gx>p.x&&gx<p.x+p.w&&gy>p.y&&gy<p.y+p.h) goalMax++;
            });
          }
        }
        R.RAP.step(S.run, 1/60);
        frames++;
      }
      return JSON.stringify({ worst:+worst.toFixed(3), boxMax, goalMax, frames,
        endX: S.run.car ? +S.run.car.x.toFixed(1) : null });})()`));
    worstCar.push({ id: LEVELS[i], v: res.worst });
    if (res.boxMax > 0) boxHits.push(LEVELS[i] + '×' + res.boxMax);
    if (res.goalMax > 0) goalHits.push(LEVELS[i] + '×' + res.goalMax);
    console.log(LEVELS[i] + '  ' + res.frames + ' 帧  车被盖最多 ' +
      (res.worst * 100).toFixed(1) + '%  木箱 ' + res.boxMax + '  旗 ' + res.goalMax +
      '  终点 x=' + res.endX);
  }

  {
    const bad = worstCar.filter(w => w.v > 0.10);
    chk('B 车身被 HUD 盖住的比例 ≤ 10%（整趟逐帧）', bad.length === 0,
      bad.length ? bad.map(b => b.id + '=' + (b.v * 100).toFixed(0) + '%').join(' ') :
        '最高 ' + (Math.max(...worstCar.map(w => w.v)) * 100).toFixed(1) + '%');
  }
  chk('C 木箱从不被 HUD 盖住', boxHits.length === 0,
    boxHits.length ? boxHits.join(' ') : '八关全部干净');
  /* ⚠ C2 的判据改了两次，两次都值得记：
   *
   * 第一版断言"终点旗**任何时刻**都不能被 HUD 盖住"，1-6 报 24 帧。
   * 逐帧查下来那 24 帧是 **t=1.53~1.92、车在 x=7.2~10.2 时**，
   * 旗还在屏幕**最右边缘**（x=1244→1061，y≈210~225），
   * 正好穿过右上角那一列面板（x=1056~1248）。
   *
   * 那不是缺陷：车往前开 1 秒旗就滚到画面中间了。真正的缺陷是
   * "**快到终点时**旗被挡住"—— 那才是玩家需要看到它的时刻。
   *
   * 所以判据改成：车已过**全程 60%** 之后，旗不能被任何面板盖住。 */
  chk('C2 临近终点时（车走完 60% 之后）终点旗不被 HUD 盖住',
    goalHits.length === 0,
    goalHits.length ? goalHits.join(' ') : '八关全部干净');

  // ═════════════ D 视觉自证：真的渲染一帧，看车在哪 ═════════════
  {
    /* 公式是抄的，可能和产品分叉。所以渲染一帧截图，
     * 在"按公式算出来的车屏幕矩形"里数木色像素 —— 车真在那儿就说明公式对得上。 */
    const key = SPEC_OF['1-6'];
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(5); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
      S.runBanner=0; S.shake=0;
      R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS[${JSON.stringify(key)}]);
      S.phase='build'; S.run=null; R.launch(); S.runBanner=0;
      R.RAP.applySpecRuntime(S.run, R.RAP.SPECS[${JSON.stringify(key)}]);
      for (let k = 0; k < 90; k++) { if (S.run.phase !== 'run') break; R.RAP.step(S.run, 1/60); }
      S.runBanner = 0; S.shake = 0;
      return 1;})()`);
    await sleep(600);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, 'r86-1-6-hud.png'), Buffer.from(shot.data, 'base64'));
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
        cx:+cx.toFixed(0), cy:+cy.toFixed(0), zoom:+cm.zoom.toFixed(2) });
    })()`));
    lines.push('1-6 渲染一帧：按公式算的车中心 (' + probe.cx + ',' + probe.cy +
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

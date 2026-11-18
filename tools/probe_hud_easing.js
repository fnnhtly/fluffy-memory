/* B 组报 0.0% 是**结构性**的，不是因为 HUD 真的安全（第 87 轮）。
 *
 * ── 为什么 ──
 *
 * 镜头目标是 `targetX = car.x + 2.0 + …`、`targetY = max(car.y, surf) + 1.5`。
 * 如果镜头**瞬间跟上**，车的屏幕位置永远是：
 *
 *   cx = 640 − 2.0×s           ≈ 532
 *   cy = 360 + 1.5×s           ≈ 441
 *
 * 也就是固定的一点。而 HUD 在 y=126~234 —— 结构上永远不会相交。
 * 所以"车被盖 0%"是**公式的恒等式**，不是被测到的安全属性。
 *
 * ── 真实情况 ──
 *
 * 镜头是**缓动**的（`k = 1 − 0.001^dt`，60fps 下每帧约 0.11），
 * 加上撞击震屏。车急升急降时镜头跟不上，车就会偏离那个固定点。
 * 那才是需要量的东西。
 */
const R = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');
const { SPEC_OF } = require('./lib/specmap.js');

const PANELS = [
  { name: 'progress', x: 84, y: 126, w: 700, h: 30 },
  { name: 'timer', x: 1280 - 224, y: 138, w: 192, h: 30 },
  { name: 'box', x: 1280 - 224, y: 174, w: 192, h: 26 },
  { name: 'frame', x: 1280 - 224, y: 206, w: 192, h: 26 },
  { name: 'challenge', x: 84, y: 162, w: 552, h: 28 }
];

function ov(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

console.log('关     瞬时跟随   缓动跟随   最差面板      车最高屏幕 y');
LEVELS.forEach(lv => {
  const trace = [];
  const st = R.simulate(lv, JSON.parse(JSON.stringify(R.SPECS[SPEC_OF[lv.levelId]] || {})),
    { maxTime: 70, trace });
  const b0 = R.newBuild();
  R.applySpec(lv, b0, R.SPECS[SPEC_OF[lv.levelId]]);
  const st0 = R.createRun(lv, b0);
  const hull = st0.car.hull;
  const ter = R.makeTerrain(lv);

  /* 两套镜头：瞬时跟随 vs 真的缓动 */
  let instantWorst = 0, easedWorst = 0, worstPanel = '', minCy = 1e9;
  let cs = null;
  const dt = 1 / 60;
  for (let k = 1; k < trace.length; k++) {
    const f = trace[k], p = trace[k - 1];
    const spd = Math.hypot((f.x - p.x) / dt, (f.y - p.y) / dt);
    const tx = f.x + 2.0 + Math.min(1.6, spd * 0.14);
    const ty = Math.max(f.y, ter.surfaceY(f.x)) + 1.5;
    const tz = 1.85 - Math.min(0.45, spd * 0.035);
    if (!cs) cs = { x: tx, y: ty, zoom: tz };
    const kk = 1 - Math.pow(0.001, Math.min(0.1, dt));
    cs.x += (tx - cs.x) * kk;
    cs.y += (ty - cs.y) * kk;
    cs.zoom += (tz - cs.zoom) * kk * 0.6;

    const sE = 32 * cs.zoom;
    const hxE = (Math.max(hull.maxX, hull.minX) - Math.min(hull.maxX, hull.minX)) * sE;
    const hyE = (hull.maxY - hull.minY) * sE;
    const cxE = 640 + (f.x - cs.x) * sE, cyE = 360 - (f.y - cs.y) * sE;
    const rectE = { x: cxE - hxE / 2, y: cyE - hyE / 2, w: hxE, h: hyE };
    let cE = 0;
    PANELS.forEach(pn => {
      const a = ov(rectE, pn);
      if (a > 0 && a / (hxE * hyE) > easedWorst) worstPanel = pn.name;
      cE += a;
    });
    easedWorst = Math.max(easedWorst, cE / (hxE * hyE));

    const sI = 32 * tz;
    const hxI = (Math.max(hull.maxX, hull.minX) - Math.min(hull.maxX, hull.minX)) * sI;
    const hyI = (hull.maxY - hull.minY) * sI;
    const cxI = 640 + (f.x - tx) * sI, cyI = 360 - (f.y - ty) * sI;
    let cI = 0;
    PANELS.forEach(pn => { cI += ov({ x: cxI - hxI / 2, y: cyI - hyI / 2, w: hxI, h: hyI }, pn); });
    instantWorst = Math.max(instantWorst, cI / (hxI * hyI));
    minCy = Math.min(minCy, cyE - hyE / 2);
  }
  console.log(lv.levelId + '  ' + (instantWorst * 100).toFixed(1).padStart(8) + '%  ' +
    (easedWorst * 100).toFixed(1).padStart(8) + '%   ' +
    (worstPanel || '—').padEnd(10) + '  ' + minCy.toFixed(0));
});

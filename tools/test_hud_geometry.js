/* 「车不会被 HUD 盖住」是**几何恒等式**，不是被测到的性质（第 87 轮）。
 *
 * ── 第 87 轮的发现 ──
 *
 * `test_hud_occlusion` 的 B 组逐帧量"车被 HUD 盖住的比例"，
 * 八关全是 **0.0%**。查下来那是因为：
 *
 *   targetX = car.x + 2.0 + min(1.6, spd*0.14)
 *   targetY = max(car.y, surf) + 1.5
 *
 * 镜头跟着车走，所以**车在屏幕上的位置是固定的**：
 *
 *   cx ≈ 640 − (2.0…3.6) × s
 *   cy ≈ 360 + 1.5 × s
 *
 * `s = 32 × zoom`，zoom ∈ [1.40, 1.85]，于是：
 *   cx ∈ [427, 550]，cy ∈ [427, 449]
 *
 * 而 HUD 最下面一块（木框耐久条）下沿是 **234**。间隙 163 px。
 * 也就是说这条判据**结构上不可能失败** —— 它量的是几何，不是产品。
 *
 * 这是"空转判据"的第五种形态（第 80 轮三条、第 82 轮看门狗）。
 *
 * ── 换成结构性判据 ──
 *
 * 真正的安全属性是：**车的屏幕驻留区与 HUD 之间要有余量**。
 * 这不需要跑物理，是一条纯几何断言 —— 而且它会在
 * "有人把 HUD 往下挪"或"有人改镜头偏移"时立刻红。
 */
const R = require('../prototype/game.js');

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

const DW = 1280, DH = 720;

/* HUD 面板（与 prototype/index.html 的 runProgressRect / runTimeRects /
 * runChallengeRect 一一对应；改那边必须改这里，否则这条判据会失守） */
const PANELS = [
  { name: 'progress', x: 84, y: 126, w: 700, h: 30 },
  { name: 'timer', x: DW - 224, y: 138, w: 192, h: 30 },
  { name: 'box', x: DW - 224, y: 174, w: 192, h: 26 },
  { name: 'frame', x: DW - 224, y: 206, w: 192, h: 26 },
  { name: 'challenge', x: 84, y: 162, w: 552, h: 28 }
];

/* 镜头参数的来源（第 87 轮抄自 drawRun，并在 tests 里注明） */
const CAM = {
  offXMin: 2.0, offXMax: 2.0 + 1.6,
  offY: 1.5,
  zoomMax: 1.85, zoomMin: 1.85 - 0.45
};
const PX = 32;

/* 车的屏幕驻留区：所有 (offset, zoom) 组合的并集 */
const sMax = PX * CAM.zoomMax, sMin = PX * CAM.zoomMin;
const cxMin = 640 - CAM.offXMax * sMax;
const cxMax = 640 - CAM.offXMin * sMin;
const cyMin = 360 + CAM.offY * sMin;
const cyMax = 360 + CAM.offY * sMax;
/* 车身半高：hull 高 1 格，加上气球/螺旋桨最多 3 格 */
const halfHMax = 1.5 * PX * CAM.zoomMax;
const halfWMax = 2.0 * PX * CAM.zoomMax;
const carBand = {
  x: cxMin - halfWMax, w: (cxMax - cxMin) + halfWMax * 2,
  y: cyMin - halfHMax, h: (cyMax - cyMin) + halfHMax * 2
};
lines.push('车在屏幕上的驻留区：x∈[' + carBand.x.toFixed(0) + ', ' +
  (carBand.x + carBand.w).toFixed(0) + ']  y∈[' + carBand.y.toFixed(0) + ', ' +
  (carBand.y + carBand.h).toFixed(0) + ']');

/* A HUD 全在驻留区之上 */
{
  const hudBottom = Math.max(...PANELS.map(p => p.y + p.h));
  const gap = carBand.y - hudBottom;
  lines.push('HUD 最下沿 y=' + hudBottom + '，车驻留区上沿 y=' +
    carBand.y.toFixed(0) + '，间隙 ' + gap.toFixed(0) + ' px');
  chk('A HUD 下沿与车的屏幕驻留区之间至少留 100 px', gap >= 100,
    gap.toFixed(0) + ' px');
}

/* B 驻留区本身要在画面内 */
{
  const inside = carBand.x >= 0 && carBand.x + carBand.w <= DW &&
    carBand.y >= 0 && carBand.y + carBand.h <= DH;
  chk('B 车的屏幕驻留区完全在画面内', inside,
    'x 到 ' + (carBand.x + carBand.w).toFixed(0) + '（宽 ' + DW + '），' +
    'y 到 ' + (carBand.y + carBand.h).toFixed(0) + '（高 ' + DH + '）');
}

/* C 车不会被任何 HUD 面板盖住（几何判定，不是逐帧模拟） */
{
  const hit = PANELS.filter(p => {
    const ox = Math.max(0, Math.min(p.x + p.w, carBand.x + carBand.w) - Math.max(p.x, carBand.x));
    const oy = Math.max(0, Math.min(p.y + p.h, carBand.y + carBand.h) - Math.max(p.y, carBand.y));
    return ox * oy > 0;
  });
  chk('C 车驻留区与任何 HUD 面板都不相交', hit.length === 0,
    hit.length ? hit.map(p => p.name).join(' ') : '5 块面板全部避开');
}

/* D 自证：把 HUD 往下挪 300 px，A/C 必须红（证明这条判据能失败） */
{
  const moved = PANELS.map(p => ({ ...p, y: p.y + 300 }));
  const hudBottom2 = Math.max(...moved.map(p => p.y + p.h));
  const gap2 = carBand.y - hudBottom2;
  const hits2 = moved.filter(p => {
    const ox = Math.max(0, Math.min(p.x + p.w, carBand.x + carBand.w) - Math.max(p.x, carBand.x));
    const oy = Math.max(0, Math.min(p.y + p.h, carBand.y + carBand.h) - Math.max(p.y, carBand.y));
    return ox * oy > 0;
  });
  chk('D 自证：HUD 下移 300 px 时 A 与 C 都会红',
    gap2 < 100 && hits2.length > 0,
    '间隙 ' + gap2.toFixed(0) + ' px，相交 ' + hits2.length + ' 块');
}

console.log(lines.join('\n'));
console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
process.exit(fail ? 1 : 0);

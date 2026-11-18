/* 飞起来的时候，看得见落点吗（第 87 轮）。
 *
 * ── 起因 ──
 *
 * 上一轮量 HUD 遮挡，八关全是 0.0%。查下来那是**结构性恒等式**，不是安全属性：
 *
 *   targetX = car.x + 2.0 + …      →  cx = 640 − 2.0×s  ≈ 532
 *   targetY = max(car.y, surf) + 1.5 →  cy = 360 + 1.5×s ≈ 441
 *
 * 车在屏幕上的位置**永远**是那一点（缓动只让它短暂偏离），
 * 而 HUD 在 y=126~234 —— 结构上不可能相交。所以那条判据只证明了几何，
 * 没证明任何产品性质。
 *
 * ── 但那个公式有个真问题 ──
 *
 * `targetY` 用的是 `max(car.y, surf)`：车飞起来时镜头跟着车上去，
 * **地面就掉出画面**。玩家看不见自己要落在哪。
 *
 * 这一关是"骑车上坡 / 气球飞起来"的游戏，落点可见性是核心的信息需求。
 *
 * ── 判据 ──
 *
 *   A 车离地 > 1 米时，"车轮正下方那一列的地面"必须在画面内
 *   B 而且要留出余量（不能在屏幕最边缘）
 *   C 车本身永远在画面内（这条是底线）
 */
const R = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');
const { SPEC_OF } = require('./lib/specmap.js');

const DW = 1280, DH = 720;

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

const rows = [];
LEVELS.forEach(lv => {
  const trace = [];
  R.simulate(lv, JSON.parse(JSON.stringify(R.SPECS[SPEC_OF[lv.levelId]] || {})),
    { maxTime: 70, trace });
  const ter = R.makeTerrain(lv);

  let airborne = 0, groundOff = 0, worstBelow = 0, carOff = 0, worstGY = 0;
  for (let k = 0; k < trace.length; k++) {
    const f = trace[k];
    const surf = ter.surfaceY(f.x);
    const air = f.y - surf;
    if (air <= 1.0) continue;      // 只看"真正离地"的帧
    airborne++;
    const spd = k > 0
      ? Math.hypot((f.x - trace[k - 1].x) * 60, (f.y - trace[k - 1].y) * 60) : 0;
    const cam = { x: f.x + 2.0 + Math.min(1.6, spd * 0.14),
                  y: Math.max(f.y, surf) + 1.5,
                  zoom: 1.85 - Math.min(0.45, spd * 0.035) };
    const s = 32 * cam.zoom;
    /* 车正下方那一列的地面在屏幕上的 y */
    const gy = 360 - (surf - cam.y) * s;
    if (gy > DH) { groundOff++; worstBelow = Math.max(worstBelow, gy - DH); }
    worstGY = Math.max(worstGY, gy);
    /* 车本身 */
    const cy = 360 - (f.y - cam.y) * s;
    if (cy < 0 || cy > DH) carOff++;
  }
  rows.push({ id: lv.levelId, airborne, groundOff, worstBelow, carOff, worstGY });
});

lines.push('关     离地帧   地面出画   最远超出   车出画');
rows.forEach(r => {
  lines.push(r.id + '  ' + String(r.airborne).padStart(6) + '  ' +
    String(r.groundOff).padStart(8) + '  ' +
    (r.worstBelow ? r.worstBelow.toFixed(0) + 'px' : '—').padStart(8) + '  ' +
    String(r.carOff).padStart(6));
});

/* A 地面可见 */
{
  const bad = rows.filter(r => r.groundOff > 0);
  chk('A 离地 > 1 米时，车正下方的地面都在画面内', bad.length === 0,
    bad.length ? bad.map(r => r.id + '（' + r.groundOff + ' 帧出画，最远 ' +
      r.worstBelow.toFixed(0) + 'px）').join(' ') : '八关全部可见');
}
/* B 车在画面内 */
{
  const bad = rows.filter(r => r.carOff > 0);
  chk('B 车本身永远在画面内', bad.length === 0,
    bad.length ? bad.map(r => r.id + '=' + r.carOff).join(' ') : '八关全部在画面内');
}

console.log(lines.join('\n'));
console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
process.exit(fail ? 1 : 0);

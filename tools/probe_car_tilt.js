/* 车体的倾角是否和地面坡度一致？
 *
 * 用户截图：1-2 跑动中，车身斜了约 45°，而轮子下面的地面只有十几度。
 * 看上去像"零件散开了"，其实是**车整体转过头了**。
 *
 * 这个探针逐帧记录 car.a（车体倾角）和 terrain.surfaceSlope（坡度），
 * 算出两者的差。差得越多，玩家越觉得车要翻。
 */
const R = require('../prototype/game.js');
const L = require('../prototype/levels.js');

console.log('RUNTIME: node');

function trace(lv, specKey, label) {
  const lvA = JSON.parse(JSON.stringify(lv));
  const b = R.newBuild();
  R.applySpec(lvA, b, R.SPECS[specKey]);
  const st = R.createRun(lvA, b);
  if (R.applySpecRuntime) R.applySpecRuntime(st, R.SPECS[specKey]);
  const rows = [];
  for (let i = 0; i < 60 * 20; i++) {
    R.step(st, 1 / 60);
    if (i % 6 === 0) {
      const car = st.car;
      /* 正确的参照是**两个轮子接触点的连线角**，不是车身中心的坡度。
       *
       * 第一版比的是 `atan(surfaceSlope(car.x))`，于是把"车贴在弯坡上的正确姿态"
       * 判成了"车歪了 24°" —— 因为车身中心那一列的切线和两轮连线本来就不一样。
       * 参照物错了，量出来的差就没有意义。 */
      const ws = car.wheels.map(w => {
        const c2 = Math.cos(car.a), s2 = Math.sin(car.a);
        const wx = car.x + w.lx * c2 - w.ly * s2;
        return { x: wx, y: st.terrain.surfaceY(wx) };
      }).sort((p, q) => p.x - q.x);
      let wheelLineDeg = 0;
      if (ws.length >= 2 && Math.abs(ws[ws.length - 1].x - ws[0].x) > 0.2) {
        wheelLineDeg = Math.atan2(ws[ws.length - 1].y - ws[0].y,
                                  ws[ws.length - 1].x - ws[0].x) * 180 / Math.PI;
      }
      const slopeDeg = Math.atan(st.terrain.surfaceSlope(car.x)) * 180 / Math.PI;
      const carDeg = car.a * 180 / Math.PI;
      rows.push({ t: st.time, x: car.x, carDeg, slopeDeg, wheelLineDeg,
                  diff: carDeg - wheelLineDeg });
    }
    if (st.result) break;
  }
  const maxDiff = rows.reduce((m, r) => Math.max(m, Math.abs(r.diff)), 0);
  const maxCar = rows.reduce((m, r) => Math.max(m, Math.abs(r.carDeg)), 0);
  const maxSlope = rows.reduce((m, r) => Math.max(m, Math.abs(r.wheelLineDeg)), 0);
  console.log('\n=== ' + label + ' (' + specKey + ') ===');
  console.log('  最大 |车倾角| = ' + maxCar.toFixed(1) + '°');
  console.log('  最大 |两轮连线角| = ' + maxSlope.toFixed(1) + '°');
  console.log('  最大 |车倾角 − 两轮连线| = ' + maxDiff.toFixed(1) +
              '°  ← 这个数越大，玩家越觉得车要翻');
  const worst = rows.slice().sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 3);
  worst.forEach(r => console.log('    t=' + r.t.toFixed(2) + ' x=' + r.x.toFixed(1) +
    '  车 ' + r.carDeg.toFixed(1) + '°  vs 轮线 ' + r.wheelLineDeg.toFixed(1) +
    '°  差 ' + r.diff.toFixed(1) + '°'));
  return { maxDiff, maxCar, maxSlope };
}

const r12 = trace(L[1], '1-2', '1-2 按一下');
const r11 = trace(L[0], '1-1', '1-1 放个轮子');

console.log('\n=== 判定 ===');
/* 车倾角偏离坡度 25° 以内算"看起来还贴着地面"。
 * 超过 45° 就是"明显歪了，像要翻"。
 * 这两个数是经验值，但方向明确：越小越好。 */
const worst = Math.max(r12.maxDiff, r11.maxDiff);
console.log('两关最差偏离 = ' + worst.toFixed(1) + '°');
if (worst > 45) {
  console.log('✗ 车体明显转过头了（> 45°）—— 玩家会以为零件散开了');
  process.exit(1);
} else if (worst > 25) {
  console.log('⚠ 车体有点过转（> 25°），边缘情况');
} else {
  console.log('✓ 车体基本贴合坡度');
}

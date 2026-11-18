/* 1-6「抬个头」的终点位置：坡脚 vs 坡上（第 86 轮）。
 *
 * ── 问题 ──
 *
 * 1-6 的地形是：col 0~15 缓下坡（4.00 → 3.95），col 16 起是一道
 * **6 米上坡**（3.95 → 9.97 @ col 24）。而 `goal = col 15` ——
 * 正好在坡脚**之前**。
 *
 * 后果：标准解 2.42 秒就到终点，那道 6 米上坡**根本用不上**。
 * 也就是说这一关教的是"气球给浮力"，但实际上玩家只需要一路开过去，
 * 浮力只是让车轻一点。
 *
 * 这也是第 85 轮 HUD 遮挡问题的真正来源：车一直贴着地面跑，
 * 镜头压得低，HUD 区域正好落在车身上。
 *
 * ── 这一轮量什么 ──
 *
 * 把终点沿坡往上挪，找一个位置使得：
 *   A 不带气球过不去（否则这一关的机制仍然没被用到）
 *   B 带气球能过，而且**不是靠飞出边界**
 *   C 标准解仍然三星
 */
const R = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');

const LV = LEVELS[5];
const BASE = JSON.parse(JSON.stringify(R.SPECS['1-6']));

function trial(goalCol, nb, withBalloon) {
  const j = JSON.parse(JSON.stringify(LV));
  j.goal = { col: goalCol };
  const spec = JSON.parse(JSON.stringify(BASE));
  if (withBalloon) {
    spec._stacks = { balloon: nb, sandbag: 2 };
  } else {
    delete spec.balloon;
  }
  const st = R.simulate(j, spec, { maxTime: 70 });
  return { result: st.result, reason: st.failReason || '', t: st.time, x: st.car.x };
}

console.log('终点位置 × 气球数：');
console.log('goal  无气球                1气球                2气球                3气球');
[15, 17, 18, 20, 22, 24].forEach(g => {
  const cells = [null, 1, 2, 3].map(nb => {
    const r = trial(g, nb, nb !== null);
    return (r.result === 'win' ? 'win ' : 'fail') + '@' + r.t.toFixed(1) + 's x=' + r.x.toFixed(0);
  });
  console.log(String(g).padStart(4) + '  ' + cells.map(c => c.padEnd(20)).join(''));
});

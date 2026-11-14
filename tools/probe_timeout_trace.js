/* 探针：那些跑满 60 秒才判 timeout 的局，车到底在干什么？
 *
 * 关心的问题是：玩家这 60 秒里看到的是"车在动、但永远到不了"吗？
 * 如果是，那 timeout 就不该是唯一出口 —— 应该有个"**没有进展**"的判定。
 *
 * 注意 simulate() 返回的是**整个 state**（不是摘要），所以位置在 r.car.x。
 * 第一版写成 r.x 全是 undefined，看起来像"车纹丝不动"—— 差点得出错误结论。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const lv5 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'levels', '05.json'), 'utf8'));

function rnd(n) { return Math.floor(Math.random() * n); }
function randomBuild() {
  const spec = {};
  const cells = []; const nFrame = 1 + rnd(3);
  for (let i = 0; i < nFrame; i++) cells.push([4, 1 + i]);
  spec.wood_frame = cells;
  if (Math.random() < 0.85) spec.wood_wheel = [[5, 1 + rnd(cells.length)]];
  if (Math.random() < 0.5) spec.wood_wheel = (spec.wood_wheel || []).concat([[5, 1 + rnd(cells.length)]]);
  if (Math.random() < 0.45) spec.motor = [[3, 1 + rnd(cells.length)]];
  if (Math.random() < 0.45) spec.battery = [[2, 1 + rnd(cells.length)]];
  if (Math.random() < 0.35) spec.pump = [[3, 1 + rnd(cells.length)]];
  spec.pig = [[4, 1]];
  return spec;
}

let found = 0;
const samples = [];
for (let i = 0; i < 500 && found < 3; i++) {
  const spec = randomBuild();
  const r = R.simulate(lv5, spec, { maxTime: 80 });
  if (r.failReason !== 'timeout') continue;
  found++;
  samples.push(spec);
  console.log(`\n=== 样本 ${found}：${JSON.stringify(spec)} ===`);
  const trail = [];
  let prevX = null, still = 0;
  for (let t = 1; t <= 60; t += 3) {
    const rr = R.simulate(lv5, spec, { maxTime: t });
    const x = rr.car ? rr.car.x : NaN, y = rr.car ? rr.car.y : NaN;
    const v = rr.car ? Math.hypot(rr.car.vx, rr.car.vy) : NaN;
    trail.push(`  ${String(t).padStart(2)}s  x=${x.toFixed(2)}  y=${y.toFixed(2)}  v=${v.toFixed(2)}`);
  }
  trail.forEach(s => console.log(s));
}

// 关键指标：60 秒里 x 前进了多少？离终点还差多少？
console.log('\n=== 汇总：timeout 局的最大行程 ===');
samples.forEach((spec, i) => {
  let best = -Infinity;
  for (let t = 1; t <= 60; t += 1) {
    const rr = R.simulate(lv5, spec, { maxTime: t });
    if (rr.car) best = Math.max(best, rr.car.x);
  }
  console.log(`  样本 ${i + 1}: 最远 x=${best.toFixed(2)} / 终点 ${lv5.goal.col}，差 ${(lv5.goal.col - best).toFixed(1)} 米`);
});

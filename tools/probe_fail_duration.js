/* 探针：一局失败通常要等多久？失败原因分布如何？
 *
 * 动机：`timeout` 的硬上限是 60 s，而六关标准解只跑 2.4–12.5 s（用掉 4%~21%）。
 * 于是有两个怀疑：
 *   A. `timeout` 实际上**永远不会触发**（等于一条死规则）；
 *   B. 更糟的可能是"车一直在动、但永远到不了"，这种局 `stuck` 也不会触发
 *      （stuck 只判速度 < 0.2 m/s），玩家要干等到 60 s。
 *
 * 这份探针不看代码，只跑局面：随机造法 × 六关，统计
 *   失败原因分布 / 失败平均耗时 / 最久的一局 / 有多少局卡在"动但没进展"。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const levelsDir = path.join(__dirname, '..', 'levels');
const levels = fs.readdirSync(levelsDir).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(levelsDir, f), 'utf8')));

// 可用的零件（1-1 的箱子给得最少，就按最宽的可用集合随机，覆盖面更大）
const POOL = ['wood_frame', 'wood_wheel', 'motor', 'battery', 'pump', 'balloon', 'sandbag'];

function rnd(n) { return Math.floor(Math.random() * n); }

function randomBuild(lv) {
  const spec = {};
  const nFrame = 1 + rnd(3);
  const cells = [];
  for (let i = 0; i < nFrame; i++) cells.push([4, 1 + i]);
  spec.wood_frame = cells;
  if (Math.random() < 0.85) spec.wood_wheel = [[5, 1 + rnd(cells.length)]];
  if (Math.random() < 0.5) spec.wood_wheel = (spec.wood_wheel || []).concat([[5, 1 + rnd(cells.length)]]);
  if (Math.random() < 0.45) spec.motor = [[3, 1 + rnd(cells.length)]];
  if (Math.random() < 0.45) spec.battery = [[2, 1 + rnd(cells.length)]];
  if (Math.random() < 0.35) spec.pump = [[3, 1 + rnd(cells.length)]];
  if (Math.random() < 0.40) {
    spec.balloon = []; const nb = 1 + rnd(3);
    for (let i = 0; i < nb; i++) spec.balloon.push([[2, 1 + rnd(cells.length)], 1 + rnd(3)]);
  }
  if (Math.random() < 0.30) {
    spec.sandbag = []; const ns = 1 + rnd(2);
    for (let i = 0; i < ns; i++) spec.sandbag.push([[6, 1 + rnd(cells.length)], 1 + rnd(2)]);
  }
  spec.pig = [[4, 1]];
  return spec;
}

const N = 60;
const rows = [];
levels.forEach(lv => {
  for (let i = 0; i < N; i++) {
    let r;
    try { r = R.simulate(lv, randomBuild(lv), { maxTime: 80 }); }
    catch (e) { rows.push({ level: lv.levelId, result: 'ERROR', t: 0, reason: e.message }); continue; }
    rows.push({
      level: lv.levelId, result: r.result, t: r.time || 0,
      reason: r.failReason || '', x: r.x, goal: lv.goal.col
    });
  }
});

const byReason = {};
rows.forEach(r => {
  const k = r.result === 'win' ? 'win' : (r.reason || 'fail?');
  byReason[k] = byReason[k] || { n: 0, sum: 0, max: 0 };
  byReason[k].n++; byReason[k].sum += r.t; byReason[k].max = Math.max(byReason[k].max, r.t);
});
console.log(`共 ${rows.length} 局（六关 × ${N} 随机造法）\n`);
console.log('结果            局数   占比    平均耗时   最久');
Object.keys(byReason).sort((a, b) => byReason[b].n - byReason[a].n).forEach(k => {
  const v = byReason[k];
  console.log(`${k.padEnd(14)} ${String(v.n).padStart(5)}  ${(v.n / rows.length * 100).toFixed(0).padStart(4)}%  ` +
    `${(v.sum / v.n).toFixed(1).padStart(7)}s ${v.max.toFixed(1).padStart(7)}s`);
});

const slow = rows.filter(r => r.t > 30).sort((a, b) => b.t - a.t);
console.log(`\n耗时 > 30 s 的局：${slow.length} 局`);
slow.slice(0, 8).forEach(r => console.log(`  ${r.level} ${r.result}/${r.reason} ${r.t.toFixed(1)}s`));

console.log(`\ntimeout 触发次数：${rows.filter(r => r.reason === 'timeout').length}`);
console.log(`超过上限前就结束的比例：${(rows.filter(r => r.t < R.Params.demoTimeLimit).length / rows.length * 100).toFixed(0)}%`);

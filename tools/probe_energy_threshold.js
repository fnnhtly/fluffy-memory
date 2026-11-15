/* 探针：1-3 的 ★★★「能量剩 ≥ N」——N 该是多少？
 *
 * 上一份量到：1-3 的 7 个随机赢局**全部**自动满足「≥30」（100% 白送）。
 * 但"白送"有两种修法，得先看清分布才能选：
 *   · 挪阈值：只要赢局的剩余电量有宽分布，把 N 提到"只有一部分赢局能到"就有分量；
 *   · 换条件：如果所有赢局电量都差不多，挪阈值只是换个数字白送。
 *
 * 这里把 1-3 的随机赢局按"结束时剩多少电"排出来，再对每个候选 N
 * 算一次"赢局里有几成拿得到"。分量落在 30%~80% 之间的 N 才算能用：
 * 太高会逼玩家刷完美，太低（100%）就是白送。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const lv = require('../prototype/levels.js')[2];   // 1-3

let seed = 24680;
function rnd(n) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; }

/* 1-3 的零件箱：wood_frame 4 / wood_wheel 2 / motor 1 / battery 1 / pig 1。
 * 关键自由度只有三个：框多高、轮子放哪两格、马达电池塞在哪。
 * 高度决定重心与翻越能力，轮位决定离地间隙 —— 这两条都会改变"马达要开多久"。 */
function randomBuild() {
  const frames = 2 + rnd(3);              // 2~4 个框
  const cells = [];
  for (let i = 0; i < frames; i++) cells.push([4, 1 + i]);
  const spec = { wood_frame: cells };
  const w1 = 1 + rnd(frames), w2 = 1 + rnd(frames);
  spec.wood_wheel = (w1 === w2) ? [[5, w1]] : [[5, w1], [5, w2]];
  spec.pig = [[4, 1 + rnd(frames)]];
  /* 马达/电池放哪格很要紧：装在轮轴那一格附近更稳，装在最上面会把车头压翻 */
  spec.motor = [[rnd(2) ? 4 : 3, 1 + rnd(frames)]];
  spec.battery = [[4, 1 + rnd(frames)]];
  return spec;
}

const wins = [];
for (let k = 0; k < 400; k++) {
  const r = R.simulate(lv, randomBuild(), { maxTime: 300, params: { demoTimeLimit: 600 } });
  if (r.result === 'win') wins.push({ t: r.time, e: r.car.energy, goal: r.starGoals && r.starGoals.challenge });
}

console.log(`400 个随机造法，赢 ${wins.length} 局。按剩余电量排序：`);
wins.sort((a, b) => a.e - b.e);
wins.forEach(w => console.log(`  ${w.e.toFixed(1)} 电　用时 ${w.t.toFixed(2)}s`));

console.log('\n=== 标准解的余量 ===');
{
  const r = R.simulate(lv, R.SPECS['1-3'], { maxTime: 300 });
  console.log(`  标准解：${r.result} @ ${r.time.toFixed(2)}s，剩电 ${r.car.energy.toFixed(1)}`);
}

console.log('\n=== 各候选阈值下，赢局拿到 ★★★ 的比例 ===');
[30, 45, 60, 70, 80, 85, 90, 95].forEach(N => {
  const pass = wins.filter(w => w.e >= N).length;
  const rate = wins.length ? pass / wins.length * 100 : 0;
  console.log(`  能量剩 ≥ ${N}：${pass}/${wins.length} = ${rate.toFixed(0)}%` +
    (rate >= 95 ? '　← 白送' : (rate <= 20 ? '　← 太狠' : '　← 有分量')));
});

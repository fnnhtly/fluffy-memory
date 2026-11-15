/* 探针：触地/磕碰的"响度分级"，六关标准解实际落在哪几档？
 *
 * 已知：标准解的 max|vn| 只有 1.27 ~ 1.91，而分级门槛是 0.8 / 2.5 / 4.5 / 6。
 * 也就是说标准解**永远只够 lvl 1**（0.8~2.5），lvl 2/3/4 的演出
 * （碎屑、震屏、全屏闪、慢动作）全套只属于失败局。
 *
 * 这解释了"落地没手感"：玩家正确通关的每一趟，脚下都只有最轻那一档。
 * 这里把六关标准解每次磕碰的 lvl 分布打出来，看看真实量程在哪。
 */
const R = require('../prototype/game.js');
const levels = require('../prototype/levels.js');
const KEYS = ['1-1', '1-2', '1-3', '1-4i', '1-5m', '1-6'];

console.log('关卡 | 磕碰数 | lvl1(≤2.5) | lvl2(≤4.5) | lvl3(≤6) | lvl4(>6) | max v');
console.log('-----|--------|------------|------------|----------|----------|------');
const allV = [];
levels.forEach((lv, i) => {
  const r = R.simulate(lv, R.SPECS[KEYS[i]], { maxTime: 300 });
  const evs = (r.events || []).filter(e => e.indexOf('touch ') === 0);
  const lvls = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let maxV = 0;
  evs.forEach(e => {
    const m = /lvl=(\d) v=([\d.]+)/.exec(e);
    if (!m) return;
    lvls[+m[1]]++;
    maxV = Math.max(maxV, +m[2]);
    allV.push(+m[2]);
  });
  console.log(`${lv.levelId} | ${String(evs.length).padStart(6)} | ${String(lvls[1]).padStart(10)} | ` +
    `${String(lvls[2]).padStart(10)} | ${String(lvls[3]).padStart(8)} | ${String(lvls[4]).padStart(8)} | ${maxV.toFixed(2)}`);
});

allV.sort((a, b) => a - b);
const q = p => allV[Math.min(allV.length - 1, Math.floor(allV.length * p))] || 0;
console.log(`\n六关标准解全部磕碰（${allV.length} 次）的速度分布：`);
console.log(`  min ${allV[0] ? allV[0].toFixed(2) : '-'}  p50 ${q(0.5).toFixed(2)}  ` +
  `p90 ${q(0.9).toFixed(2)}  p99 ${q(0.99).toFixed(2)}  max ${q(1).toFixed(2)}`);
const over = t => allV.filter(v => v > t).length;
[2.5, 3.0, 3.5, 4.0, 4.5, 6.0].forEach(t => {
  console.log(`  > ${t}: ${over(t)} 次（${(over(t) / allV.length * 100).toFixed(1)}%）`);
});

/* 在二维通关区里挑"离失败边界最远的点" —— 用真的**欧氏距离**。
 *
 * 之前用切比雪夫距离（正负各 ±d 那一圈）会把斜带状窗口算成半径 0，
 * 因为带状窗口在 (扔, 扎) 平面上是斜的：扔晚一点就必须扎晚一点。
 * 玩家感知的是"我两个动作各偏 0.5 秒还成不成"，那正是欧氏距离。
 *
 * 目标不止"最稳"，还要"弧顶低"：
 *   弧顶太高 = 车飘出画面 = 玩家看不见自己在干什么。
 * 所以对每个候选同时报 半径 / 弧顶 / 用时，人工权衡。
 */
const T = require('./tune_1_6_plat.js');
const R = T.R;

const o = { gapW: 3, platUp: 2 };
const lv0 = T.build(o);
const ter0 = R.makeTerrain(lv0);
const platY = ter0.surfaceY(lv0._platStart + 0.5);

const STEP = 0.1, TD_MIN = 2.0, TD_MAX = 6.0, TP_SPAN = 6.0;
const nTd = Math.round((TD_MAX - TD_MIN) / STEP) + 1;
const nTp = Math.round(TP_SPAN / STEP) + 1;

const grid = [];
for (let i = 0; i < nTd; i++) {
  const td = +(TD_MIN + i * STEP).toFixed(1);
  const row = [];
  for (let j = 0; j < nTp; j++) {
    const tp = +(td + 0.3 + j * STEP).toFixed(1);
    const b = T.makeCar(lv0, { balloons: 6, sandbags: 3 });
    const r = T.run(lv0, b, [{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: 1 }], 30);
    row.push({ win: r.res === 'win', maxY: r.maxY, t: r.t });
  }
  grid.push(row);
}

const fails = [];
for (let i = 0; i < nTd; i++) for (let j = 0; j < nTp; j++) if (!grid[i][j].win) fails.push([i, j]);
console.log(`网格 ${nTd}×${nTp}，失败格 ${fails.length}`);

const cands = [];
for (let i = 0; i < nTd; i++) {
  for (let j = 0; j < nTp; j++) {
    if (!grid[i][j].win) continue;
    let best = 1e9;
    for (const [fi, fj] of fails) {
      const d2 = (fi - i) * (fi - i) + (fj - j) * (fj - j);
      if (d2 < best) best = d2;
    }
    cands.push({ td: +(TD_MIN + i * STEP).toFixed(1), tp: +(TD_MIN + i * STEP + 0.3 + j * STEP).toFixed(1),
      rad: Math.sqrt(best) * STEP, maxY: grid[i][j].maxY, above: grid[i][j].maxY - platY, t: grid[i][j].t });
  }
}
cands.sort((a, b) => b.rad - a.rad);
console.log(`\n台面 y=${platY.toFixed(2)}；半径最大的 15 个点：`);
cands.slice(0, 15).forEach(c => console.log(`  扔@${c.td} 扎@${c.tp}  半径 ${c.rad.toFixed(2)}s  弧顶高出 ${c.above.toFixed(2)}m  用时 ${c.t.toFixed(1)}s`));

const good = cands.filter(c => c.above <= 5.0).sort((a, b) => b.rad - a.rad);
console.log(`\n弧顶高出 ≤5m 的点里最稳的 10 个：`);
good.slice(0, 10).forEach(c => console.log(`  扔@${c.td} 扎@${c.tp}  半径 ${c.rad.toFixed(2)}s  弧顶高出 ${c.above.toFixed(2)}m  用时 ${c.t.toFixed(1)}s`));

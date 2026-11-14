/* 在高塔版 1-6 的通关区里挑中心点：欧氏距离最大的那个。
 * 要求同时：弧顶 ≤ 塔顶 + 4 米（车不会飘出画面）。
 */
const T = require('./tune_1_6_tower.js');
const R = T.R;

const CFG = { gapW: 3, towerUp: 4, towerW: 7, goalOff: 3 };
const lv0 = T.build(CFG);
const ter0 = R.makeTerrain(lv0);
const towerY = ter0.surfaceY(lv0._towerStart + 0.5);

const STEP = 0.1, TD_MIN = 2.0, TD_MAX = 6.0, GAP = 0.3, TP_SPAN = 6.0;
const nTd = Math.round((TD_MAX - TD_MIN) / STEP) + 1;
const nTp = Math.round(TP_SPAN / STEP) + 1;
const grid = [];
const t0 = Date.now();
for (let i = 0; i < nTd; i++) {
  const td = +(TD_MIN + i * STEP).toFixed(1);
  const row = [];
  for (let j = 0; j < nTp; j++) {
    const tp = +(td + GAP + j * STEP).toFixed(1);
    const b = T.makeCar(lv0, { balloons: 6, sandbags: 3 });
    const r = T.run(lv0, b, [{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: 1 }], 30);
    row.push({ win: r.res === 'win', maxY: r.maxY, t: r.t });
  }
  grid.push(row);
}
console.log(`网格 ${nTd}×${nTp} 生成完毕，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const fails = [];
for (let i = 0; i < nTd; i++) for (let j = 0; j < nTp; j++) if (!grid[i][j].win) fails.push([i, j]);
console.log(`失败格 ${fails.length}`);

const cands = [];
for (let i = 0; i < nTd; i++) {
  for (let j = 0; j < nTp; j++) {
    if (!grid[i][j].win) continue;
    let bd = 1e9;
    for (const [fi, fj] of fails) { const d2 = (fi - i) ** 2 + (fj - j) ** 2; if (d2 < bd) bd = d2; }
    const td = +(TD_MIN + i * STEP).toFixed(1);
    cands.push({ td, tp: +(td + GAP + j * STEP).toFixed(1), rad: Math.sqrt(bd) * STEP,
      above: grid[i][j].maxY - towerY, t: grid[i][j].t });
  }
}
cands.sort((a, b) => b.rad - a.rad);
console.log(`\n塔顶 y=${towerY.toFixed(2)}；半径最大的 12 个：`);
cands.slice(0, 12).forEach(c => console.log(`  扔@${c.td} 扎@${c.tp}  半径 ${c.rad.toFixed(2)}s  弧顶+${c.above.toFixed(2)}m  用时${c.t.toFixed(1)}s`));

const good = cands.filter(c => c.above <= 4.0);
console.log(`\n弧顶 ≤ 塔顶+4m 的 ${good.length} 个点里最稳的 10 个：`);
good.slice(0, 10).forEach(c => console.log(`  扔@${c.td} 扎@${c.tp}  半径 ${c.rad.toFixed(2)}s  弧顶+${c.above.toFixed(2)}m  用时${c.t.toFixed(1)}s`));

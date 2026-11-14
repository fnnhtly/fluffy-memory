/* 挑标准解：两个指标一起看 —— 弧顶低 + 抖动方阵全绿。
 *
 * 只看"半径最大"会选到"飞 10 米高再扎"的点（半径大但车飘出画面）；
 * 只看"弧顶最低"会选到"擦着台沿过"的点（好看但窗口窄）。
 * 玩家真正体验的是"我两个动作各偏 0.5 秒还成不成"，
 * 所以直接对 ±0.5 / ±0.8 的方阵做全绿测试，再在通过的里面挑弧顶最低的。
 */
const T = require('./tune_1_6_wall.js');
const R = T.R;

const CFG = { gapW: 1, wallUp: 4 };
const lv0 = T.build(CFG);
const ter0 = R.makeTerrain(lv0);
const platY = ter0.surfaceY(lv0._platStart + 0.5);

function go(td, tp) {
  const l = T.build(CFG);
  const b = T.makeCar(l, { balloons: 6, sandbags: 3 });
  return T.run(l, b, [{ t: +td.toFixed(2), do: 'drop', n: 3 }, { t: +tp.toFixed(2), do: 'pop', n: 1 }], 30);
}

function jitter(td, tp, r) {
  const pts = [];
  for (let a = -r; a <= r + 1e-9; a += r / 2) for (let b = -r; b <= r + 1e-9; b += r / 2) pts.push([td + a, tp + b]);
  const bad = pts.filter(p => go(p[0], p[1]).res !== 'win');
  return { total: pts.length, bad: bad.length };
}

console.log(`台面 y=${platY.toFixed(2)}；扫描 (±0.5 与 ±0.8 方阵)`);
const rows = [];
for (let td = 2.5; td <= 5.51; td += 0.25) {
  for (let tp = td + 2.0; tp <= td + 6.01; tp += 0.25) {
    const r = go(td, tp);
    if (r.res !== 'win') continue;
    const j5 = jitter(td, tp, 0.5);
    const j8 = jitter(td, tp, 0.8);
    rows.push({ td: +td.toFixed(2), tp: +tp.toFixed(2), above: r.maxY - platY, t: r.t, bad5: j5.bad, bad8: j8.bad });
  }
}
console.log(`通关格 ${rows.length}`);
const safe = rows.filter(r => r.bad8 === 0).sort((a, b) => a.above - b.above);
console.log(`\n±0.8s 全绿的有 ${safe.length} 个，按弧顶从低到高：`);
safe.slice(0, 15).forEach(r => console.log(`  扔@${r.td} 扎@${r.tp}  弧顶 台+${r.above.toFixed(2)}m  用时${r.t.toFixed(1)}s`));
const safe5 = rows.filter(r => r.bad5 === 0).sort((a, b) => a.above - b.above);
console.log(`\n±0.5s 全绿的有 ${safe5.length} 个，按弧顶从低到高：`);
safe5.slice(0, 15).forEach(r => console.log(`  扔@${r.td} 扎@${r.tp}  弧顶 台+${r.above.toFixed(2)}m  用时${r.t.toFixed(1)}s`));

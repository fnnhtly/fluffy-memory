/* 在"沟1 台+4"这个结构里找最稳的通关中心点，并报告弧顶余量。
 *
 * 结构（见 tune_1_6_wall.js）：
 *   c0..c11  助跑（y≈5.7）
 *   c12      1 格沟（垂直立面，hardCols 关掉平滑）
 *   c13..c22 高台（比助跑面高 3.45 米）
 *
 * 为什么这比前几版强：
 *   沟只有 1 格宽，横向只需求 1 米；真正要克服的是 3.45 米的立面。
 *   气球上升 2.5 m/s、横速 ~1.8 m/s，斜率 1.4:1，
 *   升 3.5 米只需 1.4 秒 = 前进 2.5 米 —— 正好够，弧顶只高出 3.85 米。
 *   前几版要跨 8 格沟 → 必须升 10 米 → 车飘出画面且窗口塌到 0.1 秒。
 */
const T = require('./tune_1_6_wall.js');
const R = T.R;

const CFG = { gapW: 1, wallUp: 4 };
const lv0 = T.build(CFG);
const ter0 = R.makeTerrain(lv0);
const platY = ter0.surfaceY(lv0._platStart + 0.5);

function go(td, tp, nPop) {
  const l = T.build(CFG);
  const b = T.makeCar(l, { balloons: 6, sandbags: 3 });
  return T.run(l, b, td === null ? null : [{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: nPop || 1 }], 30);
}

console.log(`助跑面 y=${ter0.surfaceY(10.5).toFixed(2)} 台面 y=${platY.toFixed(2)} 高差 ${(platY - ter0.surfaceY(10.5)).toFixed(2)}m 终点 c${lv0._goalCol} 天花板 y>${ter0.rows + 6}`);

console.log('\n=== 四格判定 ===');
const A = (() => { const l = T.build(CFG); return T.run(l, T.makeCar(l, { balloons: 6 }), null, 30); })();
const B = (() => { const l = T.build(CFG); return T.run(l, T.makeCar(l, { balloons: 0, sandbags: 3 }), null, 30); })();
const C = (() => { const l = T.build(CFG); return T.run(l, T.makeCar(l, { balloons: 6, sandbags: 3 }), null, 30); })();
const D = go(4.0, 9999);
[[`A 只气球`, A, 'fail'], [`B 只沙袋`, B, 'fail'], [`C 都不扔`, C, 'fail'], [`D 扔了不扎`, D, 'fail']].forEach(([tag, r, want]) =>
  console.log(`  ${(r.res === want ? '✅' : '❌')} ${tag.padEnd(12)} ${String(r.res).padEnd(11)} maxX=${r.maxX.toFixed(1)} maxY=${r.maxY.toFixed(1)} 破=${r.pops} 袋=${r.dropped}`));

console.log('\n=== 扔的窗口（固定扎 @8.0） ===');
const ok = [];
for (let td = 1.0; td <= 7.9; td += 0.1) if (go(+td.toFixed(1), 8.0).res === 'win') ok.push(td);
console.log(`  ${ok.length ? `${Math.min(...ok).toFixed(1)}–${Math.max(...ok).toFixed(1)}（宽 ${(Math.max(...ok) - Math.min(...ok) + 0.1).toFixed(1)}s）` : '(无)'}`);

console.log('\n=== 扎的窗口（固定扔 @5.0） ===');
const ok2 = [];
for (let tp = 5.3; tp <= 18; tp += 0.1) if (go(5.0, +tp.toFixed(1)).res === 'win') ok2.push(tp);
console.log(`  ${ok2.length ? `${Math.min(...ok2).toFixed(1)}–${Math.max(...ok2).toFixed(1)}（宽 ${(Math.max(...ok2) - Math.min(...ok2) + 0.1).toFixed(1)}s）` : '(无)'}`);

console.log('\n=== 最优中心（欧氏距离） ===');
const STEP = 0.1, TD_MIN = 2.0, TD_MAX = 6.5, GAP = 0.3, TP_SPAN = 7.0;
const nTd = Math.round((TD_MAX - TD_MIN) / STEP) + 1;
const nTp = Math.round(TP_SPAN / STEP) + 1;
const grid = [];
for (let i = 0; i < nTd; i++) {
  const td = +(TD_MIN + i * STEP).toFixed(1);
  const row = [];
  for (let j = 0; j < nTp; j++) {
    const tp = +(td + GAP + j * STEP).toFixed(1);
    const l = T.build(CFG);
    const r = T.run(l, T.makeCar(l, { balloons: 6, sandbags: 3 }), [{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: 1 }], 30);
    row.push({ win: r.res === 'win', maxY: r.maxY, t: r.t });
  }
  grid.push(row);
}
const fails = [];
for (let i = 0; i < nTd; i++) for (let j = 0; j < nTp; j++) if (!grid[i][j].win) fails.push([i, j]);
const cands = [];
for (let i = 0; i < nTd; i++) for (let j = 0; j < nTp; j++) {
  if (!grid[i][j].win) continue;
  let bd = 1e9;
  for (const [fi, fj] of fails) { const d2 = (fi - i) ** 2 + (fj - j) ** 2; if (d2 < bd) bd = d2; }
  const td = +(TD_MIN + i * STEP).toFixed(1);
  cands.push({ td, tp: +(td + GAP + j * STEP).toFixed(1), rad: Math.sqrt(bd) * STEP, above: grid[i][j].maxY - platY, t: grid[i][j].t });
}
cands.sort((a, b) => b.rad - a.rad);
console.log(`  ${cands.length} 个通关点，最稳的 10 个：`);
cands.slice(0, 10).forEach(c => console.log(`    扔@${c.td} 扎@${c.tp}  半径 ${c.rad.toFixed(2)}s  弧顶 台+${c.above.toFixed(2)}m  用时${c.t.toFixed(1)}s`));

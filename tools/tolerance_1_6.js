/* 标准解的**容错窗口**：玩家手快 0.3 秒、手慢 0.3 秒都必须还在通关区里。
 *
 * 窗口宽度比"能通关"重要得多：
 * 一个只有 0.1 秒窗口的关卡，玩家通不了不是技术差，是关卡没设计好。
 * 这里对候选解做 ±0.5 秒的抖动矩阵，要求四角全绿。
 */
const T = require('./tune_1_6_plat.js');

const o = { gapW: 3, platUp: 2 };
const lv = T.build(o);

function go(td, tp) {
  const b = T.makeCar(lv, { balloons: 6, sandbags: 3 });
  return T.run(lv, b, [{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: 1 }], 30);
}

const cands = [];
for (let td = 4.4; td <= 5.61; td += 0.1) {
  for (let tp = 6.6; tp <= 8.41; tp += 0.1) {
    const r = go(td, tp);
    if (r.res === 'win') cands.push({ td: +td.toFixed(1), tp: +tp.toFixed(1), maxY: r.maxY, t: r.t });
  }
}
console.log(`候选区 ${cands.length} 组（td 4.4–5.6 × tp 6.6–8.4）`);

// 选"容忍半径最大"的那个点：看它到失败边界的切比雪夫距离
function winAt(td, tp) { return go(td, tp).res === 'win'; }
let best = null;
for (const c of cands) {
  let rad = 0;
  for (let d = 0.1; d <= 0.61; d += 0.1) {
    const ring = [];
    for (let a = -d; a <= d + 1e-9; a += 0.1) {
      ring.push([+ (c.td + a).toFixed(1), +(c.tp - d).toFixed(1)], [+ (c.td + a).toFixed(1), +(c.tp + d).toFixed(1)]);
      ring.push([+(c.td - d).toFixed(1), +(c.tp + a).toFixed(1)], [+(c.td + d).toFixed(1), +(c.tp + a).toFixed(1)]);
    }
    if (!ring.every(p => winAt(p[0], p[1]))) break;
    rad = +d.toFixed(1);
  }
  if (!best || rad > best.rad) best = { ...c, rad };
  console.log(`  扔@${c.td} 扎@${c.tp}  最高 y=${c.maxY.toFixed(2)}  用时 ${c.t.toFixed(1)}s  容忍半径 ${rad.toFixed(1)}s`);
}
console.log(`\n最稳：扔@${best.td} 扎@${best.tp}  半径 ±${best.rad}s  最高 y=${best.maxY.toFixed(2)}`);

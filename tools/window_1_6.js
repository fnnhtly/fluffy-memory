/* 通关窗口的**轴向宽度**（玩家真正感知的两个量）：
 *   "我什么时候扔沙袋" × "我什么时候扎气球"
 * 钻石形/切比雪夫距离会把斜带状的窗口低估成 0，
 * 所以拆成两条独立的扫描：固定扎的时刻看扔的窗口，反之亦然。
 */
const T = require('./tune_1_6_plat.js');

const o = { gapW: 3, platUp: 2 };
const lv = T.build(o);

function go(td, tp) {
  const b = T.makeCar(lv, { balloons: 6, sandbags: 3 });
  return T.run(lv, b, [{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: 1 }], 30);
}

function span(vals) {
  if (!vals.length) return '(无)';
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return `${lo.toFixed(1)}–${hi.toFixed(1)} 秒（宽 ${(hi - lo + 0.1).toFixed(1)}s）`;
}

console.log('=== 固定扎的时刻，看扔的窗口 ===');
for (const tp of [7.0, 7.5, 8.0, 8.5, 9.0, 9.5]) {
  const ok = [];
  for (let td = 1.0; td <= tp - 0.2; td += 0.1) if (go(+td.toFixed(1), tp).res === 'win') ok.push(td);
  console.log(`  扎@${tp.toFixed(1)}  扔可 ${span(ok)}`);
}

console.log('\n=== 固定扔的时刻，看扎的窗口 ===');
for (const td of [4.0, 4.5, 5.0, 5.5, 6.0]) {
  const ok = [];
  for (let tp = td + 0.3; tp <= 14; tp += 0.1) if (go(td, +tp.toFixed(1)).res === 'win') ok.push(tp);
  console.log(`  扔@${td.toFixed(1)}  扎可 ${span(ok)}`);
}

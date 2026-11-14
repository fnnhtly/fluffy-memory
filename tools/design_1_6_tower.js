const T = require('./tune_1_6_tower.js');
const R = T.R;

const CFG = { gapW: 3, towerUp: 4, towerW: 7, goalOff: 3 };
const lv = T.build(CFG);
const ter = R.makeTerrain(lv);
const towerY = ter.surfaceY(lv._towerStart + 0.5);

console.log(`塔顶 y=${towerY.toFixed(2)} 终点 c${lv._goalCol} 天花板 y>${ter.rows + 6}`);
console.log('地表 c10..c26: ' + Array.from({ length: 17 }, (_, i) => `c${10 + i}=${ter.surfaceY(10 + i + 0.5).toFixed(1)}`).join(' '));

function go(td, tp) {
  const l = T.build(CFG);
  const b = T.makeCar(l, { balloons: 6, sandbags: 3 });
  return T.run(l, b, td === null ? null : [{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: 1 }], 30);
}

console.log('\n=== 四格判定 ===');
const A = (() => { const l = T.build(CFG); const b = T.makeCar(l, { balloons: 6, sandbags: 0 }); return T.run(l, b, null, 30); })();
const B = (() => { const l = T.build(CFG); const b = T.makeCar(l, { balloons: 0, sandbags: 3 }); return T.run(l, b, null, 30); })();
const C = (() => { const l = T.build(CFG); const b = T.makeCar(l, { balloons: 6, sandbags: 3 }); return T.run(l, b, null, 30); })();
const D = go(4.5, 999);  // 只扔不扎
const D2 = go(null, null);
[[`A 只气球`, A], [`B 只沙袋`, B], [`C 都不扔`, C], [`D 扔了不扎`, D]].forEach(([tag, r]) =>
  console.log(`  ${tag.padEnd(12)} ${String(r.res).padEnd(11)} maxX=${r.maxX.toFixed(1)} maxY=${r.maxY.toFixed(1)} 破=${r.pops} 袋=${r.dropped}`));

console.log('\n=== 扔的窗口（固定扎的时刻） ===');
for (const tp of [7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0]) {
  const ok = [];
  for (let td = 1.0; td <= tp - 0.3; td += 0.1) { if (go(+td.toFixed(1), tp).res === 'win') ok.push(td); }
  console.log(`  扎@${tp.toFixed(1)}  ${ok.length ? `${Math.min(...ok).toFixed(1)}–${Math.max(...ok).toFixed(1)}（宽 ${(Math.max(...ok) - Math.min(...ok) + 0.1).toFixed(1)}s）` : '(无)'}`);
}
console.log('\n=== 扎的窗口（固定扔的时刻） ===');
for (const td of [3.0, 3.5, 4.0, 4.5, 5.0, 5.5]) {
  const ok = [];
  for (let tp = td + 0.3; tp <= 16; tp += 0.1) { if (go(td, +tp.toFixed(1)).res === 'win') ok.push(tp); }
  console.log(`  扔@${td.toFixed(1)}  ${ok.length ? `${Math.min(...ok).toFixed(1)}–${Math.max(...ok).toFixed(1)}（宽 ${(Math.max(...ok) - Math.min(...ok) + 0.1).toFixed(1)}s）` : '(无)'}`);
}

console.log('\n=== 弧顶最低的几条 ===');
const cands = [];
for (let td = 2.0; td <= 6.01; td += 0.1) {
  for (let tp = td + 0.3; tp <= td + 7.01; tp += 0.1) {
    const r = go(+td.toFixed(1), +tp.toFixed(1));
    if (r.res === 'win') cands.push({ td: +td.toFixed(1), tp: +tp.toFixed(1), maxY: r.maxY, above: r.maxY - towerY, t: r.t });
  }
}
cands.sort((a, b) => a.maxY - b.maxY);
cands.slice(0, 8).forEach(c => console.log(`  扔@${c.td} 扎@${c.tp} 弧顶塔顶+${c.above.toFixed(2)}m 用时${c.t.toFixed(1)}s`));
console.log(`通关 ${cands.length} 组；弧顶中位数 塔顶+${(cands[Math.floor(cands.length / 2)].maxY - towerY).toFixed(2)}m`);

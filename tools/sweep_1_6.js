/* 1-6「抬个头」—— 二维时刻扫描：什么时候扔沙袋 × 什么时候扎气球。
 *
 * 关卡剖面（GROUND=12；数字是"每列地表所在行"，越小越高）：
 *   c0..c4   row8→12   陡坡（出生就在坡上，一定滚得动）
 *   c5..c12  row12     助跑
 *   c13..c20 无地面     8 列宽沟（真·4 米深，hardCols 关掉平滑）
 *   c21..c27 row12     对岸平台
 *   c28..c47 row13→14  下坡到终点
 *
 * 为什么需要两个动作（这是本关要教的东西）：
 *   带沙袋（6.3+0.3+2.4=9.0 kg，净重 +1.8）→ 压在地上，能滚到崖口
 *   崖口扔沙袋（净重 −0.6）→ 以 2.5 m/s 上升，越过沟
 *   过沟后扎 3 个气球（净重 +3.0）→ 落回地面，滚到终点
 * 只带气球 = 一起步就飘上天（fail / flew_away）
 * 只带沙袋 = 冲进沟里（fail）
 * 都有但不扔 = 冲进沟里（fail）
 *
 * 这里的扫描就是**证明上面四句话**，不是找参数凑一关。
 * 一旦哪一行不成立，说明这关没在教它该教的东西，得改剖面。
 */
const F = require('./tune_1_6_flight.js');
const R = F.R;

const SEG = {
  edge: 13, gapW: 8, goalCol: 30,
  map: {
    0: 8, 1: 9, 2: 10, 3: 11, 4: 12,
    '5-12': [5, 12, 12],
    '21-27': [21, 27, 12],
    '28-32': [28, 32, 13],
    '33-47': [33, 47, 14]
  }
};

function level(extra) {
  const lv = F.makeLevel(SEG);
  if (extra) lv.partsBox = Object.assign({}, lv.partsBox, extra);
  return lv;
}

function go(o, sched, maxt) {
  const lv = level(o);
  const b = F.makeCar(lv, { balloons: o && o.noBalloon ? 0 : 6, sandbags: o && o.noBag ? 0 : 3 });
  return F.run(lv, b, sched, maxt || 22);
}

console.log('=== 四格基线 ===');
const A = go({ noBag: true }, null);
console.log(`  A 只带气球(6)        ${String(A.res).padEnd(11)} x=${A.x.toFixed(2)} maxX=${A.maxX.toFixed(1)}`);
const B = go({ noBalloon: true }, null);
console.log(`  B 只带沙袋(3)        ${String(B.res).padEnd(11)} x=${B.x.toFixed(2)} maxX=${B.maxX.toFixed(1)}`);
const C = go(null, null);
console.log(`  C 都有但不扔         ${String(C.res).padEnd(11)} x=${C.x.toFixed(2)} maxX=${C.maxX.toFixed(1)}`);

console.log('\n=== 二维扫描：扔沙袋时刻 × 扎气球时刻 ===');
const results = [];
for (let td = 1.0; td <= 4.51; td += 0.2) {
  for (let tp = td + 0.4; tp <= td + 4.01; tp += 0.2) {
    const sched = [
      { t: td, do: 'drop', n: 3 },
      { t: tp, do: 'pop', n: 3 }
    ];
    const r = go(null, sched, 24);
    results.push({ td: +td.toFixed(2), tp: +tp.toFixed(2), res: r.res, x: r.x, maxX: r.maxX, pops: r.pops });
  }
}
const wins = results.filter(r => r.res === 'win');
console.log(`  组合 ${results.length}，通关 ${wins.length}`);
if (wins.length) {
  const rows = {};
  wins.forEach(w => { rows[w.td] = (rows[w.td] || []).concat([w.tp]); });
  Object.keys(rows).map(Number).sort((a, b) => a - b).forEach(td => {
    console.log(`  扔@${td.toFixed(1)}  →  扎 @ ${rows[td].map(t => t.toFixed(1)).join(', ')}`);
  });
} else {
  // 打印每个 td 的最远距离，看卡在哪
  const byTd = {};
  results.forEach(r => { if (!byTd[r.td] || r.maxX > byTd[r.td].maxX) byTd[r.td] = r; });
  Object.keys(byTd).map(Number).sort((a, b) => a - b).forEach(td => {
    const r = byTd[td];
    console.log(`  扔@${td.toFixed(1)}  最远 x=${r.maxX.toFixed(1)} (${r.res})  (扎@${r.tp})`);
  });
}

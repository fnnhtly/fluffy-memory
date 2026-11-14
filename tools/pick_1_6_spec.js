/* 在通关窗里挑"最漂亮的一条解" —— 判据不是"能过"，是**最高点最低**。
 *
 * 为什么挑最高点：气球一扎就泄，高度全看玩家什么时候扎。
 * 如果标准解（SPECS['1-6']）本身要飞到 10 米才落得下来，
 * 那这条"标准解"教给玩家的就是"多飞一会儿没关系"，
 * 而实际手感是"车飘在画面外、看不到自己在干什么"。
 * 所以标准解必须是一条**贴着台沿掠过去的小弧线**。
 */
const T = require('./tune_1_6_plat.js');

const o = { gapW: 3, platUp: 2 };
const lv = T.build(o);

function go(td, tp, n) {
  const b = T.makeCar(lv, { balloons: 6, sandbags: 3 });
  return T.run(lv, b, [{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: n || 1 }], 26);
}

const wins = [];
for (let td = 1.0; td <= 6.01; td += 0.1) {
  for (let tp = td + 0.2; tp <= td + 8.01; tp += 0.1) {
    const r = go(td, tp, 1);
    if (r.res === 'win') wins.push({ td: +td.toFixed(2), tp: +tp.toFixed(2), maxY: r.maxY, t: r.t, x: r.x });
  }
}
console.log(`1 个气球：通关 ${wins.length} 组`);
wins.sort((a, b) => a.maxY - b.maxY);
console.log('最高点最低的 12 条：');
wins.slice(0, 12).forEach(w => console.log(`  扔@${w.td} 扎@${w.tp}  最高 y=${w.maxY.toFixed(2)}  用时 ${w.t.toFixed(1)}s`));
console.log('最高点中位数 y=' + wins[Math.floor(wins.length / 2)].maxY.toFixed(2));

// 2 个气球（分两次扎）能否更低
const wins2 = [];
for (let td = 1.0; td <= 6.01; td += 0.2) {
  for (let t1 = td + 0.2; t1 <= td + 6.01; t1 += 0.2) {
    for (let t2 = t1 + 0.2; t2 <= t1 + 3.01; t2 += 0.2) {
      const b = T.makeCar(lv, { balloons: 6, sandbags: 3 });
      const r = T.run(lv, b, [{ t: td, do: 'drop', n: 3 }, { t: t1, do: 'pop', n: 1 }, { t: t2, do: 'pop', n: 1 }], 26);
      if (r.res === 'win') wins2.push({ td: +td.toFixed(2), t1: +t1.toFixed(2), t2: +t2.toFixed(2), maxY: r.maxY, t: r.t });
    }
  }
}
wins2.sort((a, b) => a.maxY - b.maxY);
console.log(`\n2 个气球：通关 ${wins2.length} 组，最高点最低的 8 条：`);
wins2.slice(0, 8).forEach(w => console.log(`  扔@${w.td} 扎@${w.t1}/${w.t2}  最高 y=${w.maxY.toFixed(2)}  用时 ${w.t.toFixed(1)}s`));

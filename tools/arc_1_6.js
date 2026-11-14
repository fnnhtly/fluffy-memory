/* 弧线高度是被**终点距离**逼出来的，不是气球参数。
 *
 * 车过沟后横速只有 2 m/s。终点离台沿越远，滞空时间就得越长，
 * 弧顶也就越高 —— 实测终点在台沿 +9 格时弧顶 y≈15，
 * 也就是说"为了落在 9 米外，车必须先飞到 9 米高"。
 * 那不是玩家想要的画面（车飘出视线），也不是这关要教的东西。
 *
 * 所以这里扫"终点离台沿几格"，看哪个距离能同时得到
 *   ① 低弧顶（≤ 台面 + 4 米）  ② 够宽的通关窗口  ③ 四格判定仍成立
 */
const T = require('./tune_1_6_plat.js');
const R = T.R;

const o = { gapW: 3, platUp: 2 };

function buildWith(goalOff) {
  const lv = T.build(o);
  lv.goal = { col: lv._platStart + goalOff, row: lv._platTop - 1 };
  lv._goalCol = lv.goal.col;
  return lv;
}

function go(goalOff, td, tp) {
  const lv = buildWith(goalOff);
  const b = T.makeCar(lv, { balloons: 6, sandbags: 3 });
  return T.run(lv, b, td === null ? null : [{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: 1 }], 30);
}

for (const off of [3, 4, 5, 6, 7, 8, 9]) {
  const lv = buildWith(off);
  const ter = R.makeTerrain(lv);
  const platY = ter.surfaceY(lv._platStart + 0.5);
  // 正解
  const sol = go(off, 4.5, 8.5);
  // 窗口
  let wd = 0, bestTd = null;
  for (let td = 2.0; td <= 6.01; td += 0.2) {
    let cnt = 0;
    for (let tp = td + 0.3; tp <= 14; tp += 0.2) if (go(off, +td.toFixed(1), +tp.toFixed(1)).res === 'win') cnt++;
    if (cnt > wd) { wd = cnt; bestTd = +td.toFixed(1); }
  }
  const a = go(off, null, null);
  console.log(`终点=台沿+${off}: 正解 ${String(sol.res).padEnd(4)} 弧顶 y=${sol.maxY.toFixed(2)} ` +
    `(台面 ${platY.toFixed(2)}，高出 ${(sol.maxY - platY).toFixed(2)}m) ` +
    `不操作=${a.res} 最宽扔@${bestTd} 有 ${wd} 个扎点`);
}

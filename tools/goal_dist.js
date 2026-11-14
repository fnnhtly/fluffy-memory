/* 弧顶高的真正原因是**终点离墙太远**，不是气球参数。
 *
 * 数字摆在一起就很清楚：
 *   气球上升 2.5 m/s，横速只有 ~1.8 m/s → 空中轨迹斜率 1.4 : 1。
 *   墙高 3.3 米，车必须在 x=13 时已经高过 3.3 米，
 *   之后**每多飞 1 米就再升 1.4 米**。
 *   前一版把终点放在墙角 +4 格，于是车必须横向多飞 4 米 → 多升 5.6 米 →
 *   弧顶比台面高 8 米。那不是气球不好用，是"终点放太远了"。
 *
 * 所以这里扫 goalOff：终点离墙角几格。
 *   1 格 → 车过墙后几乎立刻到终点，弧顶只比台面高一点点
 *   4 格 → 多飞 3 米 = 多升 4 米
 * 同时仍要满足：不扎气球不能通关（高度门槛），窗口不能窄到 0.2 秒。
 */
const T = require('./tune_1_6_wall.js');
const R = T.R;

function withGoal(cfg, goalOff) {
  const lv = T.build(cfg);
  lv.goal = { col: lv._platStart + goalOff, row: lv._platTopRow - 1 };
  lv._goalCol = lv.goal.col;
  return lv;
}

function go(cfg, goalOff, td, tp) {
  const lv = withGoal(cfg, goalOff);
  const b = T.makeCar(lv, { balloons: 6, sandbags: 3 });
  return T.run(lv, b, td === null ? null : [{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: 1 }], 30);
}

const CFG = { gapW: 1, wallUp: 4 };
for (const off of [1, 2, 3, 4, 6]) {
  const lv = withGoal(CFG, off);
  const ter = R.makeTerrain(lv);
  const platY = ter.surfaceY(lv._platStart + 0.5);
  const runY = ter.surfaceY(10.5);
  // 不扎气球（只扔沙袋）
  const d = go(CFG, off, 4.0, 9999);
  // 最宽窗口 + 最低弧顶
  let best = null, wins = 0;
  for (let td = 2.0; td <= 6.51; td += 0.2) {
    for (let tp = td + 0.3; tp <= td + 8.01; tp += 0.2) {
      const r = go(CFG, off, +td.toFixed(1), +tp.toFixed(1));
      if (r.res !== 'win') continue;
      wins++;
      const above = r.maxY - platY;
      if (!best || above < best.above) best = { td: +td.toFixed(1), tp: +tp.toFixed(1), above, t: r.t };
    }
  }
  console.log(`终点=墙角+${off} (c${lv._goalCol}): 台面y=${platY.toFixed(2)} 墙高=${(platY - runY).toFixed(2)}m | ` +
    `不扎=${d.res} | 通关${wins} 最低弧顶 台+${best ? best.above.toFixed(2) + 'm 扔@' + best.td + ' 扎@' + best.tp : '—'}`);
}

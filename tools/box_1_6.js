/* 木箱放在哪一格，标准解「落地时」正好能吃到？
 * 木箱判定是 |Δx| < 1.7 且 |Δy| < 1.7（车心 vs 箱心 = 地表 + 0.5）。
 * 因为终点门槛要求车"落回终点地表 2.2 米内"，所以箱子必须落在
 * 车真正贴地的那一段，否则这关的三星就是死星。
 */
const R = require('../prototype/game.js');
const base = require('../levels/06.json');

const spec = R.SPECS['1-6'];
for (let dc = 0; dc <= 5; dc++) {
  const LV = JSON.parse(JSON.stringify(base));
  LV.boxes = [{ col: LV.goal.col + dc, row: LV.goal.row }];
  const st = R.simulate(LV, spec, { maxTime: 40 });
  const ter = R.makeTerrain(LV);
  const bx = LV.goal.col + dc + 0.5;
  const by = ter.surfaceY(bx) + 0.5;
  console.log(`箱@goal+${dc} (c${LV.goal.col + dc}): ${String(st.result).padEnd(5)} 星=${st.stars} 箱=${st.boxesGot} ` +
    `车(${st.car.x.toFixed(2)},${st.car.y.toFixed(2)}) 箱(${bx.toFixed(1)},${by.toFixed(2)}) ` +
    `Δx=${(st.car.x - bx).toFixed(2)} Δy=${(st.car.y - by).toFixed(2)}`);
}

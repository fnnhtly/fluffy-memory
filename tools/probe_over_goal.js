/* over_goal 的时序：标准解飞过终点旗后多久落地？
 * 用来判断"飞太高了"这条提示会不会在**赢的那一局**里误弹。 */
const R = require('../prototype/game.js');
const lv = require('../levels/06.json');
const b = R.newBuild();
R.applySpec(lv, b, R.SPECS['1-6']);
const st = R.createRun(lv, b);
let t = 0;
const acts = [{ t: 4.5, k: 'drop', n: 3 }, { t: 8.0, k: 'pop', n: 1 }];
let overT = null, overSeen = 0;
while (st.phase === 'run' && t < 25) {
  while (acts.length && acts[0].t <= t) {
    const a = acts.shift();
    for (let i = 0; i < a.n; i++) (a.k === 'drop' ? R.dropSandbag(st) : R.popBalloon(st));
  }
  R.step(st, 1 / 60); t += 1 / 60;
  const alt = Math.abs(st.car.y - st.terrain.surfaceY(st.car.x));
  if (st.car.x >= lv.goal.col && alt > 2.2) { overSeen += 1 / 60; if (overT === null) overT = t; }
}
console.log(`结果 ${st.result}/${st.failReason} at t=${t.toFixed(2)}s`);
console.log(`第一次"飞过终点但太高" t=${overT === null ? '从未' : overT.toFixed(2)}`);
console.log(`总计超高档位 ${overSeen.toFixed(2)}s`);

/* 1-6 的"开局一拍"体检：不操作会怎样？
 * 目的：确认玩家**不点任何东西**时车不会立刻飘走（那是坏的开场），
 * 以及点掉沙袋后的顺序是否在 HUD 上说得清。纯 Node，不碰浏览器。 */
const R = require('../prototype/game.js');
const lv = require('../levels/06.json');

function mk() {
  const b = R.newBuild();
  R.applySpec(lv, b, R.SPECS['1-6']);
  return b;
}

function report(tag, actions) {
  const st = R.createRun(lv, mk());
  let t = 0;
  const acts = (actions || []).slice();
  let maxY = 0, firstAirT = null;
  /* 「离地」不能拿 car.y 跟地表比：静止的车心本来就离地 1.3–2.2 米
   * （车心到车壳底的距离），于是第一版本报告出"起飞时刻 = 0.02 s"这种假读数。
   * 正确做法是拿**自身的起始高度**当基线：比开局高 0.6 米才算真离地。 */
  const y0 = st.car.y;
  while (st.phase === 'run' && t < 25) {
    while (acts.length && acts[0].t <= t) {
      const a = acts.shift();
      if (a.k === 'drop') for (let i = 0; i < (a.n || 1); i++) R.dropSandbag(st);
      if (a.k === 'pop') for (let i = 0; i < (a.n || 1); i++) R.popBalloon(st);
    }
    R.step(st, 1 / 60);
    t += 1 / 60;
    maxY = Math.max(maxY, st.car.y);
    if (firstAirT === null && st.car.y > y0 + 0.6) firstAirT = t;
  }
  console.log(`${tag}
  result=${st.result}/${st.failReason} x=${st.car.x.toFixed(2)} t=${t.toFixed(1)}s
  y0=${y0.toFixed(2)} maxY=${maxY.toFixed(2)} 升空=${firstAirT === null ? '从未' : firstAirT.toFixed(2) + 's（比开局高 0.6m）'}
  lift=${st.car.liftMass} net=${st.car.netMass} mass=${st.car.mass.toFixed(2)}
  bags总/扔=${st.sandbagTotal}/${st.sandbagsDropped} pops=${st.balloonPops}（碰地破 ${st.balloonPopsBurst}）
  stars=${JSON.stringify(st.starGoals)}
  events=${st.events.slice(0, 8).join(' | ')}`);
  return st;
}

report('A 完全不操作', []);
report('B 只扔 3 个沙袋，不扎气球', [{ t: 1.0, k: 'drop', n: 3 }]);
report('C 只扎气球，不扔沙袋', [{ t: 1.0, k: 'pop', n: 1 }]);
report('D 标准解（4.5s 扔 3 个，8s 扎 1 个）', [{ t: 4.5, k: 'drop', n: 3 }, { t: 8.0, k: 'pop', n: 1 }]);
report('E 一开始就把沙袋全扔光', [{ t: 0.2, k: 'drop', n: 3 }]);

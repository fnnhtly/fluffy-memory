/* 1-6 的关内节奏体检：把一局拆成四个阶段，看每一步之间的间隔是否合理。
 * 这是给"好玩不好玩"提供一个可量的骨架 —— AI 判不了手感，但能判
 * "有没有一步是空等"。
 *
 * 关注：
 *   1. 开局到必须做第一个动作之间有多久（太短=来不及看懂，太长=发呆）
 *   2. 起飞到必须扎气球之间有多久（这就是玩家的决策窗口）
 *   3. 落地到判赢之间有多久（拖太久会以为卡住了）
 */
const R = require('../prototype/game.js');
const lv = require('../levels/06.json');

function run(actions, tag) {
  const b = R.newBuild();
  R.applySpec(lv, b, R.SPECS['1-6']);
  const st = R.createRun(lv, b);
  const acts = (actions || []).slice();
  const y0 = st.car.y;
  let t = 0, firstDrop = null, firstAir = null, maxAlt = 0, overT = null, landT = null;
  while (st.phase === 'run' && t < 25) {
    while (acts.length && acts[0].t <= t) {
      const a = acts.shift();
      for (let i = 0; i < (a.n || 1); i++) (a.k === 'drop' ? R.dropSandbag(st) : R.popBalloon(st));
    }
    R.step(st, 1 / 60); t += 1 / 60;
    const alt = st.car.y - st.terrain.surfaceY(st.car.x);
    maxAlt = Math.max(maxAlt, alt);
    if (firstAir === null && st.car.y > y0 + 0.6) firstAir = t;
    if (firstDrop === null && st.sandbagsDropped > 0) firstDrop = t;
    if (overT === null && st.car.x >= lv.goal.col && Math.abs(alt) > 2.2) overT = t;
    if (overT !== null && landT === null && st.car.x >= lv.goal.col && Math.abs(alt) <= 2.2) landT = t;
  }
  return { tag, st, t, firstDrop, firstAir, maxAlt, overT, landT, y0 };
}

function show(r) {
  const f = v => v === null ? '—' : v.toFixed(2) + 's';
  console.log(`${r.tag}
  结果 ${r.st.result}/${r.st.failReason} 用时 ${r.t.toFixed(2)}s  起跳 ${f(r.firstAir)} 最高离地 ${r.maxAlt.toFixed(1)}m
  首次扔沙袋 ${f(r.firstDrop)}  越过终点线(太高) ${f(r.overT)}  落回终点地面 ${f(r.landT)}
  决策窗口（起飞→落地） ${r.firstAir !== null && r.landT !== null ? (r.landT - r.firstAir).toFixed(2) + 's' : '—'}`);
}

show(run([{ t: 4.5, k: 'drop', n: 3 }, { t: 8.0, k: 'pop', n: 1 }], '标准解'));

// 玩家早一点扔沙袋（2.0s 就扔光）会怎样？—— 说明"早扔"是不是也能过
show(run([{ t: 2.0, k: 'drop', n: 3 }, { t: 8.0, k: 'pop', n: 1 }], '早扔沙袋 2.0s'));

// 晚一点（7.0s 才扔）—— 会不会撞上墙
show(run([{ t: 7.0, k: 'drop', n: 3 }, { t: 9.0, k: 'pop', n: 1 }], '晚扔沙袋 7.0s'));

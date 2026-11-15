/* 探针：找一个"撞得够狠、但车没散架"的落差 —— dizzy 表情必须在这种局面下出现。
 *
 * dizzy 的判定是 `(lastImpactAt || -9) > now - 0.7`，而 mood 的优先级是
 *   dead > dizzy > hurt > scared > happy
 * 所以“猪还在车上”是前提。落差太大 → 框碎、猪被弹出 → dead 盖住 dizzy，
 * 落差太小 → 不到 damageMin=4.5，压根没有 impact。中间那条缝要量出来。
 */
const path = require('path');
const R = require(path.join(__dirname, '..', 'prototype', 'game.js'));
const LEVELS = require(path.join(__dirname, '..', 'prototype', 'levels.js'));
const lv = LEVELS[0];
console.log('落差  峰值接触  伤害档  hp最小  散架  猪在车上  lastImpactAt  结果');
[0.5, 1, 2, 3, 3.5, 4, 4.5, 5].forEach(drop => {
  R.resetParams();
  const build = R.newBuild();
  R.applySpec(lv, build, R.SPECS['1-1']);
  const st = R.createRun(lv, build);
  R.applySpecRuntime(st, R.SPECS['1-1']);
  st.car.x = 20.5;
  st.car.y = st.terrain.surfaceY(20.5) + drop;
  st.car.vx = 0; st.car.vy = 0; st.car.a = 0; st.car.w = 0;
  st.spawnGrace = 0;
  /* `collectContacts` 是第一版漏掉的那一步：不挂这个钩子，物理照常跑，
   * 但没有人记录接触速度，于是"峰值接触"这一列永远打印 0.00 ——
   * 一张每行都写 0 的表会让人以为"落地根本没接触"，正好和下面的
   * `impact v=6.0` 自相矛盾。量具的每一列都必须真的被填上。 */
  R.Params.collectContacts = [];
  let peak = 0, dmg = '-';
  for (let i = 0; i < 60 * 10; i++) {
    R.step(st, 1 / 60);
    R.Params.collectContacts.forEach(v => { if (v > peak) peak = v; });
    R.Params.collectContacts.length = 0;
    const evs = st.events.filter(e => e.indexOf('impact') === 0);
    if (evs.length && dmg === '-') dmg = evs[0];
    if (st.phase === 'resolved') break;
  }
  const alive = st.car ? st.car.parts.filter(p => p.def.structure) : [];
  const minHp = alive.length ? Math.min(...alive.map(p => p.hp)) : 'no-frame';
  console.log(`${String(drop).padStart(4)}  ${peak.toFixed(2)}       ` +
    `${String(dmg).slice(0, 18).padEnd(18)} ${String(minHp).padStart(7)}  ` +
    `${String(st.hullBroken).padEnd(5)}  ${String(st.car && st.car.hasPig).padEnd(8)}  ` +
    `${String(st.lastImpactAt).padEnd(13)}  ${st.result}${st.failReason ? '/' + st.failReason : ''}`);
  void peak;
});

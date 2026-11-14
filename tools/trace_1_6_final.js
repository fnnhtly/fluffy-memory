const R = require('../prototype/game.js');
const L = require('../levels/06.json');
const ter = R.makeTerrain(L);
const b = R.newBuild();
R.applySpec(L, b, R.SPECS['1-6']);
const st = R.createRun(L, b);
R.applySpecRuntime(st, R.SPECS['1-6']);
const spec = R.SPECS['1-6'];
const acts = [];
(spec._drops || []).forEach(a => { for (let i = 0; i < a.n; i++) acts.push({ t: a.t + i * 0.016, k: 'drop' }); });
(spec._pops || []).forEach(a => { for (let i = 0; i < a.n; i++) acts.push({ t: a.t + i * 0.016, k: 'pop' }); });
acts.sort((a, c) => a.t - c.t);
let ai = 0;
console.log(`goal c${L.goal.col} row${L.goal.row}  台面 y=${ter.surfaceY(L.goal.col + 0.5).toFixed(2)}  助跑 y=${ter.surfaceY(10.5).toFixed(2)}`);
console.log('地表 c9..c22: ' + Array.from({ length: 14 }, (_, i) => `c${9 + i}=${ter.surfaceY(9 + i + 0.5).toFixed(1)}`).join(' '));
for (let i = 0; i < 60 * 22 && st.phase === 'run'; i++) {
  while (ai < acts.length && acts[ai].t <= st.time) {
    acts[ai].k === 'drop' ? R.dropSandbag(st) : R.popBalloon(st);
    console.log(`   >>> ${acts[ai].k} 净=${st.car.netMass.toFixed(2)} 破=${st.balloonPops}`);
    ai++;
  }
  R.step(st, 1 / 60);
  if (i % 12 === 0) {
    const c = st.car;
    console.log(` t=${st.time.toFixed(2).padStart(5)} x=${c.x.toFixed(2).padStart(6)} y=${c.y.toFixed(2).padStart(6)}` +
      ` 高差=${(c.y - ter.surfaceY(c.x)).toFixed(2).padStart(6)} vx=${c.vx.toFixed(2).padStart(5)} vy=${c.vy.toFixed(2).padStart(5)} 破=${st.balloonPops} 箱=${st.boxesGot}`);
  }
}
console.log(`→ ${st.result} stars=${st.stars} x=${st.car.x.toFixed(2)} t=${st.time.toFixed(2)}`);

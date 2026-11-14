const R = require('../prototype/game.js');
const LV = require('../levels/06.json');
const ter = R.makeTerrain(LV);
const b = R.newBuild();
const spec = {
  wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]],
  balloon: [[3, 1], [3, 2]], sandbag: [[5, 2]],
  _stacks: { balloon: 3, sandbag: 3 },
  _drops: [{ t: 4.5, n: 3 }], _pops: [{ t: 8.0, n: 1 }]
};
R.applySpec(LV, b, spec);
const car = R.buildVehicle(LV, b);
console.log(`mass=${car.mass.toFixed(2)} lift=${car.liftMass.toFixed(2)} net=${car.netMass.toFixed(2)}`);
const st = R.createRun(LV, b);
R.applySpecRuntime(st, spec);
const acts = [];
spec._drops.forEach(a => { for (let i = 0; i < a.n; i++) acts.push({ t: a.t + i * 0.016, k: 'drop' }); });
spec._pops.forEach(a => { for (let i = 0; i < a.n; i++) acts.push({ t: a.t + i * 0.016, k: 'pop' }); });
acts.sort((a, c) => a.t - c.t);
let ai = 0;
console.log('墙附近地表：' + Array.from({ length: 5 }, (_, i) => `x=${11 + i}: ${ter.surfaceY(11 + i).toFixed(2)}`).join('  '));
console.log('坡度 x=12.2..13.2: ' + Array.from({ length: 6 }, (_, i) => ter.surfaceSlope(12.2 + i * 0.2).toFixed(1)).join(' '));
for (let i = 0; i < 60 * 22 && st.phase === 'run'; i++) {
  while (ai < acts.length && acts[ai].t <= st.time) { acts[ai].k === 'drop' ? R.dropSandbag(st) : R.popBalloon(st); ai++; }
  R.step(st, 1 / 60);
  if (i % 6 === 0 && st.car.x > 9) {
    const c = st.car;
    console.log(` t=${st.time.toFixed(2).padStart(5)} x=${c.x.toFixed(2).padStart(6)} y=${c.y.toFixed(2).padStart(6)}` +
      ` 高差=${(c.y - ter.surfaceY(c.x)).toFixed(2).padStart(6)} vx=${c.vx.toFixed(2).padStart(5)} vy=${c.vy.toFixed(2).padStart(5)} a=${c.a.toFixed(2).padStart(5)}`);
  }
}
console.log(`→ ${st.result || st.failReason} x=${st.car.x.toFixed(2)} t=${st.time.toFixed(2)}`);

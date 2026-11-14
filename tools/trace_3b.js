/* 3 气球 + 3 沙袋（扔光后净重 +2.85，按说升不起来）为什么能通关？
 * 如果不能，说明高台是硬的；如果能，说明"升空"不是必需的，关卡设计塌了。
 */
const R = require('../prototype/game.js');
const LV = require('../levels/06.json');
const ter = R.makeTerrain(LV);

const spec = {
  wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]],
  balloon: [[3, 1]], sandbag: [[5, 2]],
  _stacks: { balloon: 3, sandbag: 3 },
  _drops: [{ t: 4.5, n: 3 }], _pops: [{ t: 8.0, n: 1 }]
};
const b = R.newBuild();
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
console.log('地表 x=10..17: ' + Array.from({ length: 8 }, (_, i) => `${10 + i}=${ter.surfaceY(10 + i).toFixed(1)}`).join(' '));
for (let i = 0; i < 60 * 25 && st.phase === 'run'; i++) {
  while (ai < acts.length && acts[ai].t <= st.time) { acts[ai].k === 'drop' ? R.dropSandbag(st) : R.popBalloon(st); ai++; }
  R.step(st, 1 / 60);
  if (i % 12 === 0 && st.car.x > 9) {
    const c = st.car;
    console.log(` t=${st.time.toFixed(2).padStart(5)} x=${c.x.toFixed(2).padStart(6)} y=${c.y.toFixed(2).padStart(6)}` +
      ` 离地=${(c.y - ter.surfaceY(c.x)).toFixed(2).padStart(6)} vy=${c.vy.toFixed(2).padStart(5)} a=${c.a.toFixed(2).padStart(5)} 净=${c.netMass.toFixed(2)}`);
  }
}
console.log(`→ ${st.result || st.failReason} x=${st.car.x.toFixed(2)} t=${st.time.toFixed(2)} stars=${st.stars}`);

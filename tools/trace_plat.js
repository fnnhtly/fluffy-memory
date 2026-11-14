const T = require('./tune_1_6_plat.js');
const R = T.R;

const o = { gapW: 3, platUp: 2 };
const td = Number(process.argv[2] || 5);
const tp = Number(process.argv[3] || 9);
const lv = T.build(o);
const ter = R.makeTerrain(lv);
console.log(`platStart=${lv._platStart} platTop=${lv._platTop} goal=${lv._goalCol}`);
console.log('地表 c10..c32: ' + Array.from({ length: 23 }, (_, i) => `c${10 + i}=${ter.surfaceY(10 + i + 0.5).toFixed(1)}`).join(' '));
const b = T.makeCar(lv, { balloons: 6, sandbags: 3 });
const car = R.buildVehicle(lv, b);
console.log(`mass=${car.mass.toFixed(2)} lift=${car.liftMass.toFixed(2)} net=${car.netMass.toFixed(2)}`);
const st = R.createRun(lv, b);
const sc = [{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: 3 }].sort((a, c) => a.t - c.t);
for (let i = 0; i < 60 * 20 && st.phase === 'run'; i++) {
  while (sc.length && st.time >= sc[0].t) {
    const a = sc.shift();
    for (let k = 0; k < a.n; k++) a.do === 'drop' ? R.dropSandbag(st) : R.popBalloon(st);
    console.log(`   >>> ${a.do} 净=${st.car.netMass.toFixed(2)} 破=${st.balloonPops}`);
  }
  R.step(st, 1 / 60);
  if (i % 12 === 0) {
    const c = st.car;
    console.log(` t=${st.time.toFixed(2).padStart(5)} x=${c.x.toFixed(2).padStart(6)} y=${c.y.toFixed(2).padStart(6)} vx=${c.vx.toFixed(2).padStart(6)} vy=${c.vy.toFixed(2).padStart(6)} a=${c.a.toFixed(2).padStart(6)} 破=${st.balloonPops}`);
  }
}
console.log(`→ ${st.result || '(running)'} / ${st.failReason} x=${st.car.x.toFixed(2)} y=${st.car.y.toFixed(2)} t=${st.time.toFixed(1)}`);

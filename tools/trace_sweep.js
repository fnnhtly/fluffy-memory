const T = require('./tune_level_1_6.js');
const R = T.R;

const o = { drop: 5, rampLen: 6, flatLen: 2, gapW: 8, farDrop: 0, landLen: 4 };
const lv = T.makeLevel(o);
console.log('mapRows:');
lv.mapRows.forEach((s, i) => console.log(String(i).padStart(2) + ' ' + s.slice(0, 34)));
const ter = R.makeTerrain(lv);
for (let c = 0; c <= 24; c++) {
  console.log(` c${String(c).padStart(2)} topRow=${String(ter.topRow[c]).padStart(2)} h=${String(ter.heightField[c].toFixed(2)).padStart(5)} y=${String(ter.surfaceY(c + 0.5).toFixed(2)).padStart(5)} slope=${ter.surfaceSlope(c + 0.5).toFixed(2)} ${ter.material[c]}`);
}
const b = T.makeCar(lv, { balloons: 6, sandbags: 3 });
const car = R.buildVehicle(lv, b);
console.log(`mass=${car.mass.toFixed(2)} lift=${car.liftMass.toFixed(2)} net=${car.netMass.toFixed(2)} bags=${car.sandbagCount}`);
console.log('parts:', car.parts.map(p => `${p.part}@${p.r},${p.c}×${p.n}`).join(' '));
console.log('hull', JSON.stringify(car.hull));
console.log('wheels', car.wheels.map(w => `ly=${w.ly.toFixed(2)} lx=${w.lx.toFixed(2)}`).join(' '));

const st = R.createRun(lv, b);
console.log(`spawn x=${st.car.x.toFixed(2)} y=${st.car.y.toFixed(2)}`);
for (let i = 0; i < 60 * 8; i++) {
  if (st.phase !== 'run') break;
  R.step(st, 1 / 60);
  if (i % 20 === 0) {
    const c = st.car;
    console.log(` t=${st.time.toFixed(2)} x=${c.x.toFixed(2)} y=${c.y.toFixed(2)} vx=${c.vx.toFixed(2)} vy=${c.vy.toFixed(2)} a=${c.a.toFixed(2)} stuck=${(st.stuckTimer || 0).toFixed(1)}`);
  }
}
console.log('→', st.result, st.failReason, st.events.slice(0, 6).join('|'));

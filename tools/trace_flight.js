const F = require('./tune_1_6_flight.js');
const R = F.R;

const SEG = {
  edge: 13, gapW: 8, goalCol: 30,
  map: {
    0: 8, 1: 9, 2: 10, 3: 11, 4: 12,
    '5-12': [5, 12, 12],
    '21-27': [21, 27, 12],
    '28-32': [28, 32, 13],
    '33-47': [33, 47, 14]
  }
};

const td = Number(process.argv[2] || 1.0);
const tp = Number(process.argv[3] || 3.4);

const lv = F.makeLevel(SEG);
const ter = R.makeTerrain(lv);
console.log('地表 col13..24: ' + Array.from({ length: 12 }, (_, i) => `c${13 + i}=${ter.surfaceY(13 + i + 0.5).toFixed(1)}`).join(' '));
const b = F.makeCar(lv, { balloons: 6, sandbags: 3 });
const car = R.buildVehicle(lv, b);
console.log(`mass=${car.mass.toFixed(2)} lift=${car.liftMass.toFixed(2)} net=${car.netMass.toFixed(2)} bags=${car.sandbagCount}`);
console.log('cells:', Object.keys(b.cells).map(k => `${k}=${b.cells[k].part}${b.cells[k].n > 1 ? '×' + b.cells[k].n : ''}`).join(' '));

const st = R.createRun(lv, b);
const sched = [{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: 3 }].sort((a, c) => a.t - c.t);
console.log(`spawn x=${st.car.x.toFixed(2)} y=${st.car.y.toFixed(2)}  goal=${lv.goal.col}`);
for (let i = 0; i < 60 * 16 && st.phase === 'run'; i++) {
  while (sched.length && st.time >= sched[0].t) {
    const a = sched.shift();
    for (let k = 0; k < a.n; k++) a.do === 'drop' ? R.dropSandbag(st) : R.popBalloon(st);
    console.log(`   >>> ${a.do} 净=${st.car.netMass.toFixed(2)} 破=${st.balloonPops} 袋=${st.car.sandbagCount}`);
  }
  R.step(st, 1 / 60);
  if (i % 9 === 0) {
    const c = st.car;
    console.log(` t=${st.time.toFixed(2).padStart(5)} x=${c.x.toFixed(2).padStart(6)} y=${c.y.toFixed(2).padStart(6)}` +
      ` vx=${c.vx.toFixed(2).padStart(6)} vy=${c.vy.toFixed(2).padStart(6)} a=${c.a.toFixed(2).padStart(6)} 破=${st.balloonPops} 净=${c.netMass.toFixed(2)}`);
  }
}
console.log(`→ ${st.result || '(running)'} / ${st.failReason} x=${st.car.x.toFixed(2)} t=${st.time.toFixed(1)}`);
console.log('events: ' + (st.events.filter(e => /pop|sandbag|win|fail/.test(e)).slice(0, 12).join(' | ') || '(无)'));

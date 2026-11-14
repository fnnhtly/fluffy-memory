/* 逐帧追踪一局（1-6 调参用）。
 * 用法: node tools/trace_1_6.js <气球数> <沙袋数> <扔的时刻,逗号分隔|none>
 */
const T = require('./tune_level_1_6.js');
const R = T.R;

const balloons = Number(process.argv[2] || 6);
const bags = Number(process.argv[3] || 3);
const dropArg = process.argv[4] || 'none';
const dropAt = dropArg === 'none' ? [] : dropArg.split(',').map(Number);
const goalCol = Number(process.argv[5] || 30);

const cfg = {
  startCol: 1, goalCol,
  hardCols: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  profile: (() => {
    const p = {};
    p[0] = 6; p[1] = 7; p[2] = 8; p[3] = 9; p[4] = 10;
    for (let c = 5; c <= 11; c++) p[c] = 11;
    for (let c = 20; c <= 43; c++) p[c] = 11;
    return p;
  })()
};

const lv = T.makeLevel(cfg);
const b = T.makeCar(lv, { balloons, sandbags: bags });
const car = R.buildVehicle(lv, b);
console.log(`气球=${car.parts.filter(p => p.def.liftMass).reduce((a, p) => a + p.n, 0)} ` +
  `沙袋=${car.sandbagCount} mass=${car.mass.toFixed(2)} lift=${car.liftMass.toFixed(2)} net=${car.netMass.toFixed(2)}`);

const st = R.createRun(lv, b);
const drops = dropAt.slice();
console.log(`spawn x=${st.car.x.toFixed(2)} y=${st.car.y.toFixed(2)}  goal.col=${lv.goal.col}`);
for (let i = 0; i < 60 * 30; i++) {
  if (st.phase !== 'run') break;
  while (drops.length && st.time >= drops[0]) {
    drops.shift();
    const ok = R.dropSandbag(st);
    console.log(`   >>> 扔沙袋 ${ok ? 'ok' : 'no'}  净重 ${st.car.netMass.toFixed(2)}  剩余袋 ${st.car.sandbagCount}`);
  }
  R.step(st, 1 / 60);
  if (i % 15 === 0) {
    const c = st.car;
    console.log(` t=${st.time.toFixed(2).padStart(5)} x=${c.x.toFixed(2).padStart(6)} y=${c.y.toFixed(2).padStart(6)}` +
      ` vx=${c.vx.toFixed(2).padStart(6)} vy=${c.vy.toFixed(2).padStart(6)} a=${c.a.toFixed(2).padStart(6)}` +
      ` 气破=${st.balloonPops} 净=${c.netMass.toFixed(2)} ${st.hullBroken ? 'HULL!' : ''}${st.pigEjected ? 'PIG!' : ''}`);
  }
}
console.log(`→ ${st.result || '(仍在跑)'} / ${st.failReason}  x=${st.car.x.toFixed(2)} y=${st.car.y.toFixed(2)} time=${st.time.toFixed(1)}`);
console.log('events: ' + (st.events.slice(0, 14).join(' | ') || '(无)'));

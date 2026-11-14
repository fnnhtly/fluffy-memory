/* 追踪任意一个剖面的具体行为。
 * 用法: node tools/trace_cfg.js <drop> <rampLen> <flatLen> <gapW> [balloons] [bags] [dropAt|none]
 */
const T = require('./tune_level_1_6.js');
const R = T.R;

const o = {
  drop: Number(process.argv[2] || 3),
  rampLen: Number(process.argv[3] || 12),
  flatLen: Number(process.argv[4] || 4),
  gapW: Number(process.argv[5] || 8),
  farDrop: 0, landLen: 4
};
const balloons = Number(process.argv[6] || 6);
const bags = Number(process.argv[7] || 3);
const dropArg = process.argv[8] || 'none';
const dropAt = dropArg === 'none' ? [] : dropArg.split(',').map(Number);

const lv = T.makeLevel(o);
const ter = R.makeTerrain(lv);
console.log(`drop${o.drop}/ramp${o.rampLen}/flat${o.flatLen}/gap${o.gapW}  edge=${lv._edge} goal=${lv._goalCol}`);
lv.mapRows.forEach((s, i) => console.log(String(i).padStart(2) + ' ' + s.slice(0, 28)));
const line = [];
for (let c = 0; c <= lv._edge + 2; c++) line.push(`c${c}:${ter.surfaceY(c + 0.5).toFixed(1)}`);
console.log(line.join(' '));

const b = T.makeCar(lv, { balloons, sandbags: bags });
const car = R.buildVehicle(lv, b);
console.log(`气球=${car.parts.filter(p => p.def.liftMass).reduce((a, p) => a + p.n, 0)} 沙袋=${car.sandbagCount} ` +
  `mass=${car.mass.toFixed(2)} lift=${car.liftMass.toFixed(2)} net=${car.netMass.toFixed(2)}`);
console.log('cells:', Object.keys(b.cells).map(k => `${k}=${b.cells[k].part}${b.cells[k].n > 1 ? '×' + b.cells[k].n : ''}`).join(' '));
console.log('hull:', JSON.stringify(car.hull), 'wheels:', car.wheels.map(w => `lx=${w.lx.toFixed(1)}`).join(' '));

const st = R.createRun(lv, b);
console.log(`spawn x=${st.car.x.toFixed(2)} y=${st.car.y.toFixed(2)}`);
const drops = dropAt.slice();
for (let i = 0; i < 60 * 20; i++) {
  if (st.phase !== 'run') break;
  while (drops.length && st.time >= drops[0]) { drops.shift(); R.dropSandbag(st); console.log('   >>> 扔沙袋'); }
  R.step(st, 1 / 60);
  if (i % 15 === 0) {
    const c = st.car;
    console.log(` t=${st.time.toFixed(2).padStart(5)} x=${c.x.toFixed(2).padStart(6)} y=${c.y.toFixed(2).padStart(6)}` +
      ` vx=${c.vx.toFixed(2).padStart(6)} vy=${c.vy.toFixed(2).padStart(6)} a=${c.a.toFixed(2).padStart(6)} 破=${st.balloonPops} 净=${c.netMass.toFixed(2)}`);
  }
}
console.log(`→ ${st.result || '(running)'} / ${st.failReason} x=${st.car.x.toFixed(2)} t=${st.time.toFixed(1)}`);
console.log('events: ' + (st.events.slice(0, 10).join(' | ') || '(无)'));

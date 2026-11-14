const R = require('../prototype/game.js');
const L6 = require('../levels/06.json');

function mk(extra) {
  const lv = JSON.parse(JSON.stringify(L6));
  lv.partsBox = Object.assign({}, lv.partsBox, extra || {});
  delete lv.challenge;
  return lv;
}
function stackInto(lv, b, part, r, c, n) {
  const key = r + ',' + c;
  const res = R.tryPlace(lv, b, part, r, c);
  if (!res.ok) return 0;
  let have = R.cellCount(b.cells[key]);
  while (have < Math.min(n, R.PARTS[part].maxStack || 3)) {
    const r2 = R.tryPlace(lv, b, part, r, c);
    if (!r2.ok) break;
    const got = R.cellCount(b.cells[key]);
    if (got <= have) break;
    have = got;
  }
  return have;
}
function makeCar(lv, opt) {
  R.resetParams();
  const b = R.newBuild();
  for (let i = 0; i < 4; i++) R.tryPlace(lv, b, 'wood_frame', 4, i);
  R.tryPlace(lv, b, 'wood_wheel', 5, 0);
  R.tryPlace(lv, b, 'wood_wheel', 5, 3);
  R.tryPlace(lv, b, 'pig', 4, 1);
  let want = opt.balloons || 0;
  for (let c = 0; c < 4 && want > 0; c++) { const got = stackInto(lv, b, 'balloon', 3, c, Math.min(3, want)); want -= got; }
  want = opt.sandbags || 0;
  for (let c = 0; c < 4 && want > 0; c++) { if (b.cells['5,' + c]) continue; const got = stackInto(lv, b, 'sandbag', 5, c, Math.min(3, want)); want -= got; }
  return b;
}

const lv = mk({});
const b = makeCar(lv, { balloons: 6, sandbags: 3 });
console.log('cells:', Object.keys(b.cells).map(k => `${k}=${b.cells[k].part}${b.cells[k].n ? '×' + b.cells[k].n : ''}${b.cells[k].inner ? '+' + b.cells[k].inner : ''}`).join(' '));
const car = R.buildVehicle(lv, b);
console.log('car.parts:', car.parts.map(p => `${p.part}@${p.r},${p.c}×${p.n}`).join(' '));
console.log('hull', JSON.stringify(car.hull));
console.log('wheels', car.wheels.map(w => `${w.part} ly=${w.ly.toFixed(2)} r=${w.def.radius}`).join(' '));

const st = R.createRun(lv, b);
console.log('spawn', st.car.x.toFixed(2), st.car.y.toFixed(2));
for (let i = 0; i < 120 && st.phase === 'run'; i++) {
  R.step(st, 1 / 60);
  if (i < 8 || i % 20 === 0) {
    console.log(` t=${st.time.toFixed(2)} x=${st.car.x.toFixed(2)} y=${st.car.y.toFixed(2)} vy=${st.car.vy.toFixed(2)} hp=${st.pigHP} hullBroken=${st.hullBroken} pigEj=${st.pigEjected} stuck=${(st.stuckTimer||0).toFixed(2)}`);
  }
}
console.log('result', st.result, st.failReason, 'time', st.time.toFixed(2));
console.log('events:', st.events.slice(0, 20).join(' | '));

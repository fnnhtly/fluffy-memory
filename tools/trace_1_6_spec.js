const R = require('../prototype/game.js');
const L = require('../levels/06.json');
const st = R.simulate(L, R.SPECS['1-6'], { maxTime: 40 });
const ter = R.makeTerrain(L);
console.log(`result=${st.result} stars=${st.stars} goals=${JSON.stringify(st.starGoals)} t=${st.time.toFixed(2)}`);
console.log('地形: ' + Array.from({ length: 32 }, (_, i) => `c${i}=${ter.surfaceY(i + 0.5).toFixed(1)}`).join(' '));
// 重跑一次拿轨迹
const R2 = require('../prototype/game.js');
const b = R2.newBuild();
R2.applySpec(L, b, R2.SPECS['1-6']);
const s2 = R2.createRun(L, b);
R2.applySpecRuntime(s2, R2.SPECS['1-6']);
const acts = [];
(R2.SPECS['1-6']._drops || []).forEach(a => { for (let i = 0; i < a.n; i++) acts.push({ t: a.t + i * 0.016, k: 'drop' }); });
(R2.SPECS['1-6']._pops || []).forEach(a => { for (let i = 0; i < a.n; i++) acts.push({ t: a.t + i * 0.016, k: 'pop' }); });
acts.sort((a, c) => a.t - c.t);
let ai = 0;
const rows = [];
for (let i = 0; i < 60 * 20 && s2.phase === 'run'; i++) {
  while (ai < acts.length && acts[ai].t <= s2.time) {
    acts[ai].k === 'drop' ? R2.dropSandbag(s2) : R2.popBalloon(s2);
    ai++;
  }
  R2.step(s2, 1 / 60);
  if (i % 10 === 0) rows.push({ t: s2.time, x: s2.car.x, y: s2.car.y });
}
console.log('\n每列经过时的 y：');
for (let c = 14; c <= 30; c++) {
  const hit = rows.filter(r => Math.abs(r.x - c) < 0.16);
  if (hit.length) {
    const r = hit[0];
    console.log(`  c${c}: y=${r.y.toFixed(2)} 地表=${ter.surfaceY(c + 0.5).toFixed(2)} 高度差=${(r.y - ter.surfaceY(c + 0.5)).toFixed(2)} (t=${r.t.toFixed(2)})`);
  }
}

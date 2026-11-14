/* 定稿：选定 (W=8s, D=2m) 之后，玩家的等待时间到底缩短了多少？
 *
 * 必须分两段看：
 *   - 本来就在 10 秒内结算的局（stuck 大多数）→ 看门狗不该有任何影响；
 *   - 本来要白等 30~60 秒的局 → 这才是要救的。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const levelsDir = path.join(__dirname, '..', 'levels');
const levels = fs.readdirSync(levelsDir).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(levelsDir, f), 'utf8')));
const KEYS = ['1-1', '1-2', '1-3', '1-4i', '1-5m', '1-6'];

const W = 8, D = 2.0;

function trace(level, spec, maxTime) {
  const build = R.newBuild();
  R.applySpec(level, build, spec);
  const st = R.createRun(level, build);
  R.applySpecRuntime(st, spec);
  const dt = 1 / 60, goalX = level.goal.col;
  const hist = [];
  const acts = [];
  ((spec && spec._presses) || []).forEach(a => acts.push({ t: a.t, k: a.k || 'press' }));
  ((spec && spec._drops) || []).forEach(a => {
    for (let i = 0; i < (a.n || 1); i++) acts.push({ t: a.t + i * 0.016, k: 'drop' });
  });
  ((spec && _popsOf(spec)) || []).forEach(a => {
    for (let i = 0; i < (a.n || 1); i++) acts.push({ t: a.t + i * 0.016, k: 'pop' });
  });
  acts.sort((a, b) => a.t - b.t);
  let ai = 0, t = 0, fireAt = null;
  while (st.phase === 'run' && t < maxTime) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      if (acts[ai].k === 'drop') R.dropSandbag(st);
      else if (acts[ai].k === 'pop') R.popBalloon(st);
      else if (acts[ai].k === 'press') R.pressInteract(st, 1);
      else R.releaseInteract(st, 1);
      ai++;
    }
    R.step(st, dt);
    t += dt;
    hist.push({ t: st.time, left: goalX - st.car.x, y: st.car.y });
    while (hist.length > 2 && hist[0].t < st.time - W - 0.1) hist.shift();
    if (hist.length && st.time - hist[0].t >= W - 1e-6 && fireAt === null) {
      const gainLeft = hist[0].left - (goalX - st.car.x);
      const gainY = st.car.y - hist[0].y;
      if (gainLeft < D && gainY < D) fireAt = st.time;
    }
  }
  return { result: st.result || (st.phase === 'resolved' ? 'fail' : 'running'), t: st.time, fireAt };
}
function _popsOf(spec) { return spec && spec._pops; }

function rnd(n) { return Math.floor(Math.random() * n); }
function randomBuild() {
  const spec = {}; const cells = []; const nFrame = 1 + rnd(3);
  for (let i = 0; i < nFrame; i++) cells.push([4, 1 + i]);
  spec.wood_frame = cells;
  if (Math.random() < 0.85) spec.wood_wheel = [[5, 1 + rnd(cells.length)]];
  if (Math.random() < 0.5) spec.wood_wheel = (spec.wood_wheel || []).concat([[5, 1 + rnd(cells.length)]]);
  if (Math.random() < 0.45) spec.motor = [[3, 1 + rnd(cells.length)]];
  if (Math.random() < 0.45) spec.battery = [[2, 1 + rnd(cells.length)]];
  if (Math.random() < 0.35) spec.pump = [[3, 1 + rnd(cells.length)]];
  spec.pig = [[4, 1]];
  return spec;
}

const rows = [];
levels.forEach(lv => { for (let i = 0; i < 50; i++) rows.push(trace(lv, randomBuild(), 70)); });

const buckets = [[0, 10], [10, 20], [20, 30], [30, 45], [45, 61]];
console.log('失败局按"实际等待秒数"分桶：看门狗生效前 / 后\n');
console.log('等待区间      局数   改前总秒   改后总秒   节省');
let tBefore = 0, tAfter = 0;
buckets.forEach(([a, b]) => {
  const inB = rows.filter(r => r.result === 'fail' && r.t >= a && r.t < b);
  if (!inB.length) return;
  const before = inB.reduce((s, r) => s + r.t, 0);
  const after = inB.reduce((s, r) => s + (r.fireAt !== null && r.fireAt < r.t ? r.fireAt : r.t), 0);
  tBefore += before; tAfter += after;
  console.log(`${String(a).padStart(3)}–${String(b).padStart(2)}s ${String(inB.length).padStart(7)} ` +
    `${before.toFixed(0).padStart(10)}s ${after.toFixed(0).padStart(10)}s ${(before - after).toFixed(0).padStart(7)}s`);
});
console.log(`\n所有失败局合计：${tBefore.toFixed(0)}s → ${tAfter.toFixed(0)}s，` +
  `省 ${(tBefore - tAfter).toFixed(0)}s（${((tBefore - tAfter) / tBefore * 100).toFixed(0)}%）`);
console.log(`平均每局：${(tBefore / rows.filter(r => r.result === 'fail').length).toFixed(1)}s → ` +
  `${(tAfter / rows.filter(r => r.result === 'fail').length).toFixed(1)}s`);

const wins = rows.filter(r => r.result === 'win');
console.log(`\n获胜局 ${wins.length} 局，被误杀 ${wins.filter(w => w.fireAt !== null).length} 局`);

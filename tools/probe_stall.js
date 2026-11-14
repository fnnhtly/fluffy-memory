/* 探针：每局"最久多久没有往前推进"？
 *
 * 目的：为"没有进展就早点判失败"这个看门狗定一个**不会误杀**的阈值。
 *
 * 判据设计要点：
 *   - 只看 x 会误杀"垂直爬升"（气球流），所以同时看 y；
 *   - 但不该无限宽容：一辆在坡上以 0.2 m/s 慢慢溜的车，60 秒只前进 14 米，
 *     然后在墙前停住 —— 玩家这 60 秒既没操作也没希望。
 *
 * 所以量两件事：
 *   1. 所有**获胜**局的最长停滞（看门狗阈值必须大于它，否则误杀）；
 *   2. 所有**失败**局的最长停滞（看门狗能救回多少白等）。
 *
 * 踩过的坑：第一版用 `R.simulate(level, spec, {maxTime: t})` 逐步推进，
 * 结果全是 0.0s —— 因为 simulate 里写的是 `opts.maxTime || 70`，
 * **t=0 是假值 → 直接跑满 70 秒**，第一次调用就已经结算了。
 * 正确做法是用 createRun + step 自己推，这也顺便给出逐帧样本。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const levelsDir = path.join(__dirname, '..', 'levels');
const levels = fs.readdirSync(levelsDir).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(levelsDir, f), 'utf8')));
const KEYS = ['1-1', '1-2', '1-3', '1-4i', '1-5m', '1-6'];

/* 用 createRun + step 推一局，逐帧记录"最长无进展时长"。
 * 无进展 = 距上次推进已经过了很久，且**两个方向都没挪过 0.3 米**。
 * 只认"新高"（maxX / maxY）而不是"位移"，是为了不被来回晃动的车骗过去。 */
function longestStall(level, spec, maxTime) {
  const build = R.newBuild();
  R.applySpec(level, build, spec);
  const st = R.createRun(level, build);
  R.applySpecRuntime(st, spec);
  const dt = 1 / 60;
  let bestX = -Infinity, bestY = -Infinity, lastProgress = 0, worst = 0;
  const acts = [];
  ((spec && spec._presses) || []).forEach(a => acts.push({ t: a.t, k: a.k || 'press' }));
  ((spec && spec._drops) || []).forEach(a => {
    for (let i = 0; i < (a.n || 1); i++) acts.push({ t: a.t + i * 0.016, k: 'drop' });
  });
  ((spec && spec._pops) || []).forEach(a => {
    for (let i = 0; i < (a.n || 1); i++) acts.push({ t: a.t + i * 0.016, k: 'pop' });
  });
  acts.sort((a, b) => a.t - b.t);
  let ai = 0;
  let t = 0;
  const trail = [];
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
    const c = st.car;
    let improved = false;
    if (c.x > bestX + 0.3) { bestX = c.x; improved = true; }
    if (c.y > bestY + 0.3) { bestY = c.y; improved = true; }
    if (improved) lastProgress = st.time;
    if (st.time - lastProgress > worst) worst = st.time - lastProgress;
    if (Math.round(st.time * 60) % 120 === 0) {
      trail.push(`t=${st.time.toFixed(0)} x=${c.x.toFixed(1)} y=${c.y.toFixed(1)} v=${Math.hypot(c.vx, c.vy).toFixed(2)}`);
    }
  }
  return {
    worst, t: st.time, res: st.result || (st.phase === 'resolved' ? 'fail' : 'running'),
    reason: st.failReason || '', x: st.car.x, trail
  };
}

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

console.log('--- 标准解：最长无进展 ---');
const winStalls = [];
levels.forEach((lv, i) => {
  const k = KEYS[i] || lv.levelId;
  if (!R.SPECS[k]) return;
  const s = longestStall(lv, R.SPECS[k], 30);
  winStalls.push(s);
  console.log(`  ${lv.levelId} ${lv.name}  ${s.res}@${s.t.toFixed(1)}s  最久无进展 ${s.worst.toFixed(1)}s`);
});

console.log('\n--- 随机造法（每关 40 局）---');
const all = [];
levels.forEach(lv => {
  for (let i = 0; i < 40; i++) all.push({ level: lv.levelId, goal: lv.goal.col, ...longestStall(lv, randomBuild(), 25) });
});
const fails = all.filter(a => a.res === 'fail');
const wins = all.filter(a => a.res === 'win');
console.log(`  共 ${all.length} 局：win ${wins.length} / fail ${fails.length} / 未结算 ${all.length - wins.length - fails.length}`);

const buckets = [0, 1, 2, 3, 4, 6, 8, 12, 25];
console.log('\n  失败局最长无进展分布：');
for (let i = 0; i < buckets.length - 1; i++) {
  const n = fails.filter(f => f.worst >= buckets[i] && f.worst < buckets[i + 1]).length;
  const bar = '█'.repeat(Math.round(n / Math.max(1, fails.length) * 40));
  console.log(`    ${String(buckets[i]).padStart(2)}–${String(buckets[i + 1]).padStart(2)}s ${String(n).padStart(4)}  ${bar}`);
}
const longFail = fails.filter(f => f.worst >= 8);
console.log(`\n  无进展 ≥8s 的失败局：${longFail.length} / ${fails.length}（占 ${(longFail.length / Math.max(1, fails.length) * 100).toFixed(0)}%）`);

console.log('\n  最久的 8 局（看它到底在干什么）：');
longFail.sort((a, b) => b.worst - a.worst).slice(0, 8).forEach(f => {
  console.log(`    ${f.level} ${f.reason} 判负于 ${f.t.toFixed(1)}s，无进展 ${f.worst.toFixed(1)}s，` +
    `最远 x=${f.x.toFixed(1)}/${f.goal}`);
});

console.log('\n获胜局的最长停滞（阈值必须严格大于它）：',
  Math.max(...winStalls.map(w => w.worst), ...wins.map(w => w.worst)).toFixed(1) + 's');

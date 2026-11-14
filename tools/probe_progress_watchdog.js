/* 探针：给"没进展就早点判负"的看门狗定阈值。
 *
 * 上一份量出：获胜局最长停滞 0.7 秒（两个方向都在推进），
 * 而 33/240 局在 25 秒内**根本没结算** —— 它们既不是 stuck（速度 > 0.2 m/s），
 * 也没到 60 秒硬上限，玩家只能干等。那些就是"在坡上以 0.2 m/s 慢慢溜"的车。
 *
 * 这份量的是**朝终点方向的进展**（不是位移，也不是速度）：
 *   指标 = 距终点还剩多少米，取历史最小值；
 *   如果连续 N 秒没能把这个最小值再减小 D 米，就算"没有实质进展"。
 *
 * 要同时满足两件事才算可用：
 *   1. 任何**最终获胜**的局，都不能触发它（否则误杀合法解）；
 *   2. 那些白等的局，能明显提前判负。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const levelsDir = path.join(__dirname, '..', 'levels');
const levels = fs.readdirSync(levelsDir).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(levelsDir, f), 'utf8')));
const KEYS = ['1-1', '1-2', '1-3', '1-4i', '1-5m', '1-6'];

/* 跑一局，记账：
 *   maxNoGain = 最久"距终点最小距离没有减少 D 米"的持续时长
 *   best      = 最小距离终点
 * 用 createRun + step 自己推，能看到逐帧细节（simulate 直接跑到结算，看不到中间）。 */
function trace(level, spec, maxTime, D) {
  const build = R.newBuild();
  R.applySpec(level, build, spec);
  const st = R.createRun(level, build);
  R.applySpecRuntime(st, spec);
  const dt = 1 / 60;
  const goalX = level.goal.col;
  let bestLeft = Infinity, lastGain = 0, maxNoGain = 0;
  const acts = [];
  ((spec && spec._presses) || []).forEach(a => acts.push({ t: a.t, k: a.k || 'press' }));
  ((spec && spec._drops) || []).forEach(a => {
    for (let i = 0; i < (a.n || 1); i++) acts.push({ t: a.t + i * 0.016, k: 'drop' });
  });
  ((spec && spec._pops) || []).forEach(a => {
    for (let i = 0; i < (a.n || 1); i++) acts.push({ t: a.t + i * 0.016, k: 'pop' });
  });
  acts.sort((a, b) => a.t - b.t);
  let ai = 0, t = 0;
  let firstFire = null;
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
    const left = goalX - st.car.x;
    if (left < bestLeft - D) { bestLeft = left; lastGain = st.time; }
    const noGain = st.time - lastGain;
    if (noGain > maxNoGain) maxNoGain = noGain;
    if (firstFire === null && noGain > 8) firstFire = st.time;
  }
  return {
    result: st.result || (st.phase === 'resolved' ? 'fail' : 'running'),
    reason: st.failReason || '', t: st.time,
    maxNoGain, bestLeft: bestLeft, firstFire, x: st.car.x
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

const D = 1.0;   // "实质进展" = 距终点再近 1 米
console.log(`判据：连续 N 秒没能把「距终点最小距离」再缩小 ${D} 米 = 没有实质进展\n`);

const wins = [];
levels.forEach((lv, i) => {
  const k = KEYS[i] || lv.levelId;
  if (!R.SPECS[k]) return;
  const s = trace(lv, R.SPECS[k], 30, D);
  wins.push({ level: lv.levelId, ...s });
  console.log(`  标准解 ${lv.levelId} ${s.result}@${s.t.toFixed(1)}s  最长无进展 ${s.maxNoGain.toFixed(1)}s`);
});

console.log('\n--- 随机造法（每关 60 局，跑 70 秒看真实结局）---');
const all = [];
levels.forEach(lv => {
  for (let i = 0; i < 60; i++) all.push({ level: lv.levelId, goal: lv.goal.col, ...trace(lv, randomBuild(), 70, D) });
});
all.forEach(a => wins.push(a));

const realWins = all.filter(a => a.result === 'win');
console.log(`  win ${realWins.length} / fail ${all.filter(a => a.result === 'fail').length} / ` +
  `仍在跑 ${all.filter(a => a.result === 'running').length}`);
console.log(`  获胜局最长无实质进展：${Math.max(...realWins.map(w => w.maxNoGain)).toFixed(1)}s`);

console.log('\n  若把看门狗设在 8 秒，会误杀多少获胜局？');
const killed = realWins.filter(w => w.maxNoGain >= 8);
console.log(`    ${killed.length} 局` + (killed.length ? '：' +
  killed.map(k => `${k.level}(${k.maxNoGain.toFixed(1)}s)`).join(', ') : '（0 误杀）'));

console.log('\n  失败局里，看门狗 8 秒能在第几秒判（对比硬上限 60 秒）？');
const fails = all.filter(a => a.result === 'fail');
const save = fails.filter(f => f.firstFire !== null).map(f => 60 - f.firstFire);
console.log(`    能提前判的：${save.length} / ${fails.length} 局`);
if (save.length) {
  save.sort((a, b) => a - b);
  console.log(`    平均提前 ${(save.reduce((a, b) => a + b, 0) / save.length).toFixed(1)} 秒，` +
    `最多提前 ${save[save.length - 1].toFixed(1)} 秒`);
}
const cantCatch = fails.filter(f => f.firstFire === null);
console.log(`    抓不到的：${cantCatch.length} 局` +
  (cantCatch.length ? '（' + cantCatch.slice(0, 5).map(f => `${f.level}/${f.reason}@${f.t.toFixed(0)}s`).join(', ') + '）' : ''));

/* 探针：给"溜得太慢也算没戏"定一个**速率**型看门狗。
 *
 * 为什么不是"停滞"型：`probe_progress_watchdog` 量出，那些白等的局**一直在往前挪**
 * （0.2~0.4 m/s 慢慢溜下坡），所以"停滞 N 秒"永远不触发 —— 341 局一局都抓不到。
 * 它们不是不动，是**动得太慢，慢到不值得让玩家等**。
 *
 * 所以换判据：滑动窗口 W 秒内
 *   「距终点」没有缩小 D 米，**并且** 高度没有上升 D 米 → 判定"再等也没用"。
 * 加上高度这一条是为了不误杀气球流：气球车横向可能很慢，但它一路在爬升。
 *
 * 必须先证明它不误杀：标准解 + 所有随机获胜局。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const levelsDir = path.join(__dirname, '..', 'levels');
const levels = fs.readdirSync(levelsDir).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(levelsDir, f), 'utf8')));
const KEYS = ['1-1', '1-2', '1-3', '1-4i', '1-5m', '1-6'];

function trace(level, spec, maxTime, W, D) {
  const build = R.newBuild();
  R.applySpec(level, build, spec);
  const st = R.createRun(level, build);
  R.applySpecRuntime(st, spec);
  const dt = 1 / 60, goalX = level.goal.col;
  const hist = [];   // {t, left, y}
  const acts = [];
  ((spec && spec._presses) || []).forEach(a => acts.push({ t: a.t, k: a.k || 'press' }));
  ((spec && spec._drops) || []).forEach(a => {
    for (let i = 0; i < (a.n || 1); i++) acts.push({ t: a.t + i * 0.016, k: 'drop' });
  });
  ((spec && spec._pops) || []).forEach(a => {
    for (let i = 0; i < (a.n || 1); i++) acts.push({ t: a.t + i * 0.016, k: 'pop' });
  });
  acts.sort((a, b) => a.t - b.t);
  let ai = 0, t = 0, fireAt = null, maxWindowNoGain = 0;
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
    // 窗口回看：找 W 秒前那一帧
    const i0 = hist.findIndex(h => h.t >= st.time - W);
    if (i0 >= 0 && hist[i0].t <= st.time - W + 1e-6) {
      const gainLeft = hist[i0].left - (goalX - st.car.x);   // 距终点缩小了多少
      const gainY = st.car.y - hist[i0].y;
      const noGainFor = st.time - hist[i0].t;
      if (gainLeft < D && gainY < D) {
        if (maxWindowNoGain < noGainFor) maxWindowNoGain = noGainFor;
        if (fireAt === null) fireAt = st.time;
      }
    }
  }
  return {
    result: st.result || (st.phase === 'resolved' ? 'fail' : 'running'),
    reason: st.failReason || '', t: st.time, fireAt, x: st.car.x,
    left: goalX - st.car.x
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

const W = 10, D = 2.0;
console.log(`看门狗：${W} 秒内「距终点」没缩小 ${D} 米、高度也没上升 ${D} 米 → 判没戏\n`);

console.log('--- 标准解 ---');
const stdWins = [];
levels.forEach((lv, i) => {
  const k = KEYS[i] || lv.levelId;
  if (!R.SPECS[k]) return;
  const s = trace(lv, R.SPECS[k], 30, W, D);
  stdWins.push(s);
  console.log(`  ${lv.levelId} ${s.result}@${s.t.toFixed(1)}s  首次触发=${s.fireAt === null ? '从未' : s.fireAt.toFixed(1) + 's'}`);
});

console.log('\n--- 随机造法（每关 60 局，跑满 70 秒看真实结局）---');
const all = [];
levels.forEach(lv => {
  for (let i = 0; i < 60; i++) all.push({ level: lv.levelId, ...trace(lv, randomBuild(), 70, W, D) });
});
const realWins = all.filter(a => a.result === 'win');
const realFails = all.filter(a => a.result === 'fail');
console.log(`  win ${realWins.length} / fail ${realFails.length} / 还在跑 ${all.length - realWins.length - realFails.length}`);

const misfire = realWins.filter(w => w.fireAt !== null);
console.log(`\n误杀获胜局：${misfire.length} 局` +
  (misfire.length ? ' ← ' + misfire.slice(0, 6).map(m => `${m.level}@${m.fireAt.toFixed(1)}s`).join(', ') : '（0）'));

const caught = realFails.filter(f => f.fireAt !== null);
const bySaving = caught.map(f => ({ level: f.level, at: f.fireAt, real: f.t }));
bySaving.sort((a, b) => b.real - a.real);
console.log(`\n能提前判的失败局：${caught.length} / ${realFails.length}`);
if (bySaving.length) {
  const totalSaving = bySaving.reduce((a, b) => a + (b.real - b.at), 0);
  console.log(`  合计省下 ${totalSaving.toFixed(0)} 玩家秒，平均每局省 ${(totalSaving / bySaving.length).toFixed(1)} 秒`);
  console.log('  省得最多的 8 局（原判定 → 看门狗可判）：');
  bySaving.slice(0, 8).forEach(b =>
    console.log(`    ${b.level}  ${b.real.toFixed(1)}s → ${b.at.toFixed(1)}s  （省 ${(b.real - b.at).toFixed(1)}s）`));
}
const missed = realFails.filter(f => f.fireAt === null);
console.log(`\n看门狗打不到的失败局：${missed.length}`);
const reasons = {};
missed.forEach(m => { reasons[m.reason] = (reasons[m.reason] || 0) + 1; });
Object.keys(reasons).forEach(k => console.log(`  ${k}: ${reasons[k]}`));

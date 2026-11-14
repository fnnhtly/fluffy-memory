/* 选阈值：速率型看门狗 (W, D) 的扫描。
 *
 * 判据：滑动窗口 W 秒内，「距终点」没缩小 D 米，且高度没上升 D 米 → 判没戏。
 * 等价于"期望速度 < D/W m/s 且 不上升"。所以要扫的是 D/W。
 *
 * 三条硬约束：
 *   1. **误杀获胜局 = 0**（这条不满足就整个方案作废）；
 *   2. 标准解不能触发；
 *   3. 尽量多抓那些要白等 60 秒的局。
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
  const hist = [];
  const acts = [];
  ((spec && spec._presses) || []).forEach(a => acts.push({ t: a.t, k: a.k || 'press' }));
  ((spec && spec._drops) || []).forEach(a => {
    for (let i = 0; i < (a.n || 1); i++) acts.push({ t: a.t + i * 0.016, k: 'drop' });
  });
  ((spec && spec._pops) || []).forEach(a => {
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
    // 丢掉过老的样本，只留窗口内的
    while (hist.length > 2 && hist[0].t < st.time - W - 0.1) hist.shift();
    if (!hist.length) continue;
    const h0 = hist[0];
    if (st.time - h0.t >= W - 1e-6) {
      const gainLeft = h0.left - (goalX - st.car.x);
      const gainY = st.car.y - h0.y;
      if (gainLeft < D && gainY < D && fireAt === null) fireAt = st.time;
    }
  }
  return {
    result: st.result || (st.phase === 'resolved' ? 'fail' : 'running'),
    reason: st.failReason || '', t: st.time, fireAt
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

// 预先生成随机样本，保证不同 (W,D) 用的是同一批造法
const samples = [];
levels.forEach(lv => { for (let i = 0; i < 50; i++) samples.push({ lv, spec: randomBuild() }); });

const combos = [];
[[6, 1.5], [8, 2.0], [10, 2.0], [10, 3.0], [12, 2.0], [12, 3.0], [15, 3.0], [20, 4.0]]
  .forEach(([W, D]) => combos.push({ W, D }));

console.log('波长 W  门槛 D   期望速度   误杀获胜   标准解误杀   提前判出的失败局   平均省秒   最多省秒');
combos.forEach(({ W, D }) => {
  let misfire = 0, stdFire = 0, caught = 0, savingSum = 0, maxSave = 0, nFail = 0;
  // 标准解
  levels.forEach((lv, i) => {
    const k = KEYS[i] || lv.levelId;
    if (!R.SPECS[k]) return;
    const s = trace(lv, R.SPECS[k], 30, W, D);
    if (s.fireAt !== null) stdFire++;
  });
  samples.forEach(({ lv, spec }) => {
    const s = trace(lv, spec, 70, W, D);
    if (s.result === 'win') { if (s.fireAt !== null) misfire++; }
    else if (s.result === 'fail') {
      nFail++;
      if (s.fireAt !== null && s.fireAt < s.t) {
        caught++; const sv = s.t - s.fireAt; savingSum += sv; maxSave = Math.max(maxSave, sv);
      }
    }
  });
  console.log(`${String(W).padStart(5)}  ${String(D).padStart(6)}  ` +
    `${(D / W).toFixed(2).padStart(8)} m/s  ${String(misfire).padStart(8)}  ${String(stdFire).padStart(11)}  ` +
    `${String(caught).padStart(14)}/${nFail}  ${(caught ? savingSum / caught : 0).toFixed(1).padStart(7)}s  ` +
    `${maxSave.toFixed(1).padStart(7)}s`);
});

/* 看门狗阈值的**安全边际**（第 82 轮，第二版 —— 走引擎的 trace）。
 *
 * ── 第一版错在哪 ──
 *
 * 第一版自己手写了一份"时间轴 + 逐帧 step"的循环，处理了 `_drops`
 * 但**漏了 `_seeds`**。于是 1-7 / 1-8 的标准解在它眼里"从没升过岩柱 /
 * 风场从没触发"，量出最小进展 −1.4 米，看起来像阈值会误杀。
 *
 * 这是连着第二轮犯同一个错：round 81 漏 `_drops`、round 82 漏 `_seeds`。
 * 所以这一轮把 `opts.trace` 加进了引擎的 `simulate()` —— 轨迹由
 * **引擎自己**录，工具只读，不再有第二份循环。
 *
 * ── 判据 ──
 *
 * 对每一局**获胜**的车，量它在任意 W 秒窗口里"朝终点的最小进展"。
 * 这个最小值离门槛 D 有多远，就是这条阈值的安全余量。
 */
const R = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');
const { SPEC_OF } = require('./lib/specmap.js');

function rnd(n) { return Math.floor(Math.random() * n); }

function randomBuild(lv) {
  const box = lv.partsBox || {};
  const spec = {};
  const nFrame = 1 + rnd(3);
  const frames = [];
  for (let i = 0; i < nFrame; i++) frames.push([4, 1 + i]);
  spec.wood_frame = frames;
  if (Math.random() < 0.85) {
    spec.wood_wheel = [[5, 1 + rnd(nFrame)]];
    if (Math.random() < 0.5) spec.wood_wheel = spec.wood_wheel.concat([[5, 1 + rnd(nFrame)]]);
  }
  ['propeller', 'jet', 'pump'].forEach(k => {
    if (box[k] > 0 && Math.random() < 0.4) spec[k] = [[3, 1 + rnd(nFrame)]];
  });
  if (box.balloon > 0 && Math.random() < 0.5) {
    spec.balloon = [[3, 1 + rnd(nFrame)]];
    spec._stacks = Object.assign(spec._stacks || {}, { balloon: 1 + rnd(3) });
  }
  if (box.sandbag > 0 && Math.random() < 0.5) {
    spec.sandbag = [[5, 1 + rnd(nFrame)]];
    spec._stacks = Object.assign(spec._stacks || {}, { sandbag: 1 + rnd(3) });
  }
  spec.pig = [[4, 1]];
  return spec;
}

/* 一局在窗口宽度 W 下的**最小进展**（所有窗口里取最小值） */
function minGain(trace, W) {
  let worst = Infinity, worstAt = 0;
  for (let i = 0; i < trace.length; i++) {
    let j = i;
    while (j > 0 && trace[j].t > trace[i].t - W) j--;
    if (trace[i].t - trace[j].t < W - 1e-6) continue;
    const gainLeft = trace[j].left - trace[i].left;
    const gainY = trace[i].y - trace[j].y;
    const g = Math.max(gainLeft, gainY);
    if (g < worst) { worst = g; worstAt = trace[i].t; }
  }
  return { gain: worst === Infinity ? null : +worst.toFixed(3), at: +worstAt.toFixed(2) };
}

/* ---------- 1. 真实标准解的边际（硬约束） ---------- */
console.log('=== 真实标准解的最小进展（走引擎 trace）===');
[6, 8, 10].forEach(W => {
  const rows = [];
  LEVELS.forEach(lv => {
    const spec = JSON.parse(JSON.stringify(R.SPECS[SPEC_OF[lv.levelId]] || {}));
    const tr = [];
    R.simulate(lv, spec, { maxTime: 120, trace: tr });
    const mg = minGain(tr, W);
    rows.push({ id: lv.levelId, gain: mg.gain, at: mg.at });
  });
  const vals = rows.filter(r => r.gain !== null).map(r => r.gain);
  const min = vals.length ? Math.min(...vals) : null;
  console.log('  W=' + W + '：' + rows.map(r => r.id + '=' + r.gain).join(' ') +
    '   最小 ' + min);
});

/* ---------- 2. 随机局的边际 ---------- */
console.log('');
const N = 150;
const wins = [];
const fails = [];
LEVELS.forEach(lv => {
  for (let i = 0; i < N; i++) {
    const spec = randomBuild(lv);
    const tr = [];
    const st = R.simulate(lv, spec, { maxTime: 70, trace: tr });
    if (st.result === 'win') wins.push({ lv, tr });
    else if (st.result === 'fail') fails.push({ lv, tr });
  }
});
console.log('随机 ' + (wins.length + fails.length) + ' 局：获胜 ' + wins.length +
  '，失败 ' + fails.length);

[6, 8, 10].forEach(W => {
  const gains = wins.map(w => minGain(w.tr, W).gain).filter(g => g !== null);
  gains.sort((a, b) => a - b);
  if (!gains.length) { console.log('  W=' + W + '：没有可量的获胜局'); return; }
  console.log('  W=' + W + '：获胜局最小进展 最小=' + gains[0] +
    '  P5=' + gains[Math.max(0, Math.floor(gains.length * 0.05))] +
    '  中位=' + gains[Math.floor(gains.length / 2)] +
    '   （' + gains.length + ' 局）');
});

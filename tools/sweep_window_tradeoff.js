/* W=8 的边际只有 0.98 秒 —— 要不要提高（第 82 轮）。
 *
 * 最长标准解是 1-3 的 7.02 秒，而 `progressWindow = 8`。
 * 余量 0.98 秒（12%）。这意味着只要 1-3 稍微慢一点点
 * （玩家开得保守、将来关卡调长、物理再改一次），看门狗就会开始误杀。
 *
 * 而"不误杀"是硬约束，"尽量多抓"是优化项。所以先量：W 提到 10 会损失多少抓取。
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

/* 在给定的 (W,D) 下，这局会不会被判 no_progress（用 trace 复算） */
function wouldFire(trace, W, D) {
  for (let i = 0; i < trace.length; i++) {
    let j = i;
    while (j > 0 && trace[j].t > trace[i].t - W) j--;
    if (trace[i].t - trace[j].t < W - 1e-6) continue;
    const gainLeft = trace[j].left - trace[i].left;
    const gainY = trace[i].y - trace[j].y;
    if (gainLeft < D && gainY < D) return trace[i].t;
  }
  return null;
}

/* 标准解时长 */
const durs = LEVELS.map(lv => {
  const st = R.simulate(lv, JSON.parse(JSON.stringify(R.SPECS[SPEC_OF[lv.levelId]] || {})),
    { maxTime: 120 });
  return { id: lv.levelId, t: +st.time.toFixed(2) };
});
const maxDur = Math.max(...durs.map(d => d.t));
console.log('最长标准解时长 ' + maxDur + ' 秒（' +
  durs.filter(d => d.t === maxDur).map(d => d.id).join(',') + '）');

/* 随机样本 */
const N = 120;
const samples = [];
LEVELS.forEach(lv => {
  for (let i = 0; i < N; i++) {
    const tr = [];
    const st = R.simulate(lv, randomBuild(lv), { maxTime: 70, trace: tr });
    samples.push({ result: st.result, time: st.time, tr });
  }
});
const wins = samples.filter(s => s.result === 'win').length;
const fails = samples.filter(s => s.result === 'fail').length;
console.log('随机 ' + samples.length + ' 局：获胜 ' + wins + '，失败 ' + fails);

console.log('');
console.log('W    余量(相对最长)  误杀获胜  抓到失败  抓到比例  平均判负时刻');
[6, 8, 10, 12, 15].forEach(W => {
  let killed = 0, caught = 0, sumT = 0;
  samples.forEach(s => {
    const fireAt = wouldFire(s.tr, W, 2);
    if (s.result === 'win' && fireAt !== null) killed++;
    if (s.result === 'fail' && fireAt !== null) { caught++; sumT += fireAt; }
  });
  const margin = ((W / maxDur - 1) * 100).toFixed(0) + '%';
  console.log(String(W).padStart(2) + '   ' + margin.padStart(12) +
    '      ' + String(killed).padStart(4) +
    '      ' + String(caught + '/' + fails).padStart(9) +
    '   ' + (fails ? (caught / fails * 100).toFixed(1) + '%' : '—').padStart(7) +
    '   ' + (caught ? (sumT / caught).toFixed(1) + 's' : '—').padStart(8));
});

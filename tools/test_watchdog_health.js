/* 「没有进展」看门狗在**质心修正之后**还有没有用（第 82 轮）。
 *
 * ── 为什么问这个 ──
 *
 * `progressWindow = 8` / `progressGain = 2` 是旧物理下调出来的。
 * 第 77 轮换了转动模型与接触分享之后，车的速度曲线全变了：
 * 要么很快冲过去，要么很快卡住（`stuck` 5 秒就抓）。
 *
 * 如果新物理下**没有任何失败局**是"慢慢溜"型的，那这条看门狗
 * 就是死代码 —— 留着它只会让玩家在看不懂的时机被判负。
 *
 * ── 判据 ──
 *
 *   A 真实标准解在 W=8/D=2 下 0 触发（硬约束）
 *   B 随机获胜局的安全边际（最小进展离门槛多远）
 *   C 失败局的判负原因分布：no_progress 占多少
 *   D 如果 no_progress 抓到的局数 ≤ 1%，明确记录"这条阈值接近死代码"
 */
const R = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');
const { SPEC_OF } = require('./lib/specmap.js');

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}
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

/* 用引擎录下的轨迹算"任意 W 秒窗口里的最小进展"。 */
function minGain(trace, W) {
  let worst = Infinity;
  for (let i = 0; i < trace.length; i++) {
    let j = i;
    while (j > 0 && trace[j].t > trace[i].t - W) j--;
    if (trace[i].t - trace[j].t < W - 1e-6) continue;
    const g = Math.max(trace[j].left - trace[i].left, trace[i].y - trace[j].y);
    if (g < worst) worst = g;
  }
  return worst === Infinity ? null : +worst.toFixed(2);
}

const W = R.Params.progressWindow, D = R.Params.progressGain;

// ═════════════ A 真实标准解 0 触发 ═════════════
{
  const fired = [];
  const gains = [];
  LEVELS.forEach(lv => {
    const spec = JSON.parse(JSON.stringify(R.SPECS[SPEC_OF[lv.levelId]] || {}));
    const tr = [];
    const st = R.simulate(lv, spec, { maxTime: 120, trace: tr });
    if (st.result !== 'win') { fired.push(lv.levelId + ' 没赢'); return; }
    const g = minGain(tr, W);
    gains.push({ id: lv.levelId, g });
    if (g !== null && g < D) fired.push(lv.levelId + ' 最小进展 ' + g + ' < ' + D);
  });
  lines.push('W=' + W + ' D=' + D + '：标准解最小进展 ' +
    gains.map(x => x.id + '=' + (x.g === null ? '（太快，无窗口）' : x.g)).join(' '));
  chk('A 八关真实标准解全部 0 触发（硬约束）', fired.length === 0,
    fired.length ? fired.join(' / ') : '0 触发');
}

// ═════════════ B 随机获胜局的边际 ═════════════
const N = 150;
const wins = [];
const fails = [];
{
  LEVELS.forEach(lv => {
    for (let i = 0; i < N; i++) {
      const spec = randomBuild(lv);
      const tr = [];
      const st = R.simulate(lv, spec, { maxTime: 70, trace: tr });
      if (st.result === 'win') wins.push({ lv, tr });
      else if (st.result === 'fail') fails.push({ lv, reason: st.failReason, tr, t: st.time });
    }
  });
  const gains = wins.map(w => minGain(w.tr, W)).filter(g => g !== null).sort((a, b) => a - b);
  lines.push('随机 ' + (wins.length + fails.length) + ' 局：获胜 ' + wins.length +
    '，失败 ' + fails.length);
  if (gains.length) {
    lines.push('获胜局最小进展：最小 ' + gains[0] + '  P5 ' +
      gains[Math.max(0, Math.floor(gains.length * 0.05))] +
      '  中位 ' + gains[Math.floor(gains.length / 2)] + '（' + gains.length + ' 局可量）');
    chk('B 随机获胜局的最小进展离门槛 ≥ 3 倍（安全边际）',
      gains[0] >= D * 3, gains[0] + ' vs ' + D);
  } else {
    chk('B 随机获胜局全部太快、没有可量窗口（等于 0 风险）', true, '0 局可量');
  }
}

// ═════════════ C 失败局的判负原因分布 ═════════════
{
  const byReason = {};
  fails.forEach(f => { byReason[f.reason] = (byReason[f.reason] || 0) + 1; });
  lines.push('失败原因分布：' + Object.keys(byReason).sort((a, b) => byReason[b] - byReason[a])
    .map(k => k + '=' + byReason[k]).join(' ') + '（共 ' + fails.length + '）');
  const np = byReason.no_progress || 0;
  const pct = fails.length ? (np / fails.length * 100).toFixed(1) : '0';
  lines.push('其中 no_progress 抓到 ' + np + ' 局（' + pct + '%）');

  /* 判据：看门狗要么真的抓到东西，要么就该记录"接近死代码"。
   * 两种都接受，但必须量出来是哪一种 —— 不能让它默默待着。 */
  if (np === 0) {
    chk('C no_progress 抓到 0 局 —— 记录为"新物理下接近死代码"', true, '0 局');
  } else {
    chk('C no_progress 确实抓到了局（> 0）', np > 0, np + ' 局 / ' + pct + '%');
  }
}

// ═════════════ D 判负时机：不能太晚 ═════════════
{
  const npTimes = fails.filter(f => f.reason === 'no_progress').map(f => f.t);
  if (npTimes.length) {
    npTimes.sort((a, b) => a - b);
    lines.push('no_progress 判负时刻：最小 ' + npTimes[0].toFixed(1) +
      '  中位 ' + npTimes[Math.floor(npTimes.length / 2)].toFixed(1) +
      '  最大 ' + npTimes[npTimes.length - 1].toFixed(1) + ' 秒');
    chk('D no_progress 判得不算太晚（最晚 ≤ 30 秒）', npTimes[npTimes.length - 1] <= 30,
      npTimes[npTimes.length - 1].toFixed(1) + 's');
  } else {
    chk('D 没有 no_progress 局可量（记录项）', true, '0 局');
  }
}

// ═════════════ E 引擎的 trace 和 simulate 的结果一致 ═════════════
{
  /* 这是这一轮新增的基础设施，必须自证：录了 trace 和不录，结果必须一样。 */
  let bad = [];
  LEVELS.slice(0, 4).forEach(lv => {
    const spec = JSON.parse(JSON.stringify(R.SPECS[SPEC_OF[lv.levelId]] || {}));
    const a = R.simulate(lv, spec, { maxTime: 60 });
    const tr = [];
    const b = R.simulate(lv, JSON.parse(JSON.stringify(spec)), { maxTime: 60, trace: tr });
    if (a.result !== b.result || Math.abs(a.time - b.time) > 1e-6) {
      bad.push(lv.levelId + ' ' + a.result + '@' + a.time.toFixed(2) +
        ' vs ' + b.result + '@' + b.time.toFixed(2));
    }
    if (!tr.length) bad.push(lv.levelId + ' trace 是空的');
  });
  chk('E 开着 trace 跑不影响结果（基础设施自证）', bad.length === 0,
    bad.length ? bad.join(' / ') : '结果与时间都一致');
}

console.log(lines.join('\n'));
console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
if (fail) console.log('失败项：' + fail + ' 条');
process.exit(fail ? 1 : 0);

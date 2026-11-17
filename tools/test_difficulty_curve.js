/* 难度曲线（第 83 轮，第四版）。
 *
 * ── 前三版的三个错误，全都值得记 ──
 *
 *   1. 用"标准解时长"当难度 → 那只量了关卡长度。
 *   2. randomBuild 从不放种子 → 1-5/1-7/1-8 通关率 0%。
 *   3. randomBuild 从不放伞/风之翼 → 1-8 仍然 0%。
 *   4. **采样量不足**：N=240 时，通关率 1.7% 的关报 0% 的概率是 1.6%
 *      （(1−0.017)^240 ≈ 1.6e−2）—— 也就是说每跑 60 次会出现一次假 0%。
 *
 * 第四版的三条措施：
 *   · randomBuild 来自 `lib/random_build.js`（唯一一份，零件池从 partsBox 读）
 *   · 触发时刻范围覆盖 0.6~6.0 秒（1-8 的窗口是 3.75 起）
 *   · **逐个累积采样**：每关跑到"至少 3 次通关"或"跑满 3000 局"为止。
 *     这样低概率的关不会因为采样不足而报 0%。
 */
const R = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');
const { SPEC_OF } = require('./lib/specmap.js');
const { randomBuild } = require('./lib/random_build.js');

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

/* 每关跑到"**既**跑够了 MIN_N 局、**又**攒到 MIN_WINS 次通关"或"跑满 MAX_N 局"。
 *
 * ⚠ 第一版只要求 `win < MIN_WINS` 就继续，于是 1-1 攒够 3 次通关时就只跑了 6 局，
 * 报出 **50%**（真实值约 13%）—— 那是**严重的向上偏差**：
 * 早停总是停在"运气好"的那一侧。
 *
 * 必须同时要求跑了足够多局，比例才有意义。MIN_N=300 让"3 次通关"
 * 至少意味着 1%，同时把总体偏差压到可接受范围。 */
const MIN_WINS = 3;
const MIN_N = 300;
const MAX_N = 2000;

const rows = [];
LEVELS.forEach(lv => {
  let win = 0, n = 0, stars = 0, sum = 0;
  while (n < MAX_N && !(n >= MIN_N && win >= MIN_WINS)) {
    const st = R.simulate(lv, randomBuild(lv), { maxTime: 70 });
    n++;
    if (st.result === 'win') { win++; stars += st.stars; sum += st.time; }
  }
  rows.push({
    id: lv.levelId, win, n,
    rate: win / n * 100,
    avgT: win ? sum / win : null,
    stars: win ? stars / win : null
  });
});

lines.push('关     通关次数/局数      通关率    平均时长   平均星数');
rows.forEach(r => {
  lines.push(r.id + '  ' + (r.win + '/' + r.n).padStart(12) + '   ' +
    r.rate.toFixed(2).padStart(8) + '%   ' +
    (r.avgT === null ? '—' : r.avgT.toFixed(2) + 's').padStart(8) + '   ' +
    (r.stars === null ? '—' : r.stars.toFixed(1)));
});

/* A 每一关在随机探索下都可通关 */
{
  const dead = rows.filter(r => r.win === 0);
  chk('A 每一关在随机探索下都可通关（至少 1 次）', dead.length === 0,
    dead.length ? dead.map(r => r.id + '（' + r.n + ' 局 0 次）').join(',') : '8 关全部可达');
}

/* B 后半段不比前半段容易 */
{
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const first = avg(rows.slice(0, 4).map(r => r.rate));
  const last = avg(rows.slice(4).map(r => r.rate));
  lines.push('前半段（1-1..1-4）平均 ' + first.toFixed(2) + '%，' +
    '后半段（1-5..1-8）平均 ' + last.toFixed(2) + '%');
  chk('B 后半段不比前半段容易（机制关确实更难）', last <= first + 2,
    last.toFixed(2) + '% vs ' + first.toFixed(2) + '%');
}

/* C 每关都"随机可达但不无脑" */
{
  const out = rows.filter(r => r.win === 0 || r.rate > 70);
  chk('C 每关通关率 ∈ (0%, 70%]（可达但不无脑）', out.length === 0,
    out.length ? out.map(r => r.id + '=' + r.rate.toFixed(2) + '%').join(' ') : '全部在区间内');
}

/* D 标准解仍然三星 */
{
  const bad = [];
  LEVELS.forEach(lv => {
    const st = R.simulate(lv, JSON.parse(JSON.stringify(R.SPECS[SPEC_OF[lv.levelId]] || {})),
      { maxTime: 120 });
    if (!(st.result === 'win' && st.stars === 3)) {
      bad.push(lv.levelId + '=' + st.result + '/' + st.stars);
    }
  });
  chk('D 八关标准解仍然三星通关', bad.length === 0,
    bad.length ? bad.join(',') : '全部 win ★3');
}

/* E 1-8 的四个必要条件逐级放开后通关率单调上升（说明它确实是"条件叠加"） */
{
  /* 这条守的是"1-8 可达"这件事的**原因**，而不是结果。
   * 如果哪天有人把某一关改成"只可能靠标准解"，这条会红。 */
  const LV = LEVELS[7];
  const N = 200;
  function rateOf(mut) {
    let w = 0;
    for (let i = 0; i < N; i++) {
      const s = randomBuild(LV); mut(s);
      if (R.simulate(LV, s, { maxTime: 70 }).result === 'win') w++;
    }
    return w / N * 100;
  }
  const r0 = rateOf(() => {});
  const r3 = rateOf(s => {
    s.anemo_core = [[4, 2]];
    s._seeds = [{ t: 4.5, kind: 'anemo' }];
    s.umbrella = [[3, 2]];
    s.propeller = [[3, 1]];
    s._dirs = { propeller: 0 };
  });
  lines.push('1-8：全随机 ' + r0.toFixed(1) + '% → 四个条件都强制 ' + r3.toFixed(1) + '%');
  chk('E 1-8 补齐必要条件后通关率显著上升（确实是条件叠加）',
    r3 > r0, r3.toFixed(1) + '% > ' + r0.toFixed(1) + '%');
}

console.log(lines.join('\n'));
console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
if (fail) console.log('失败项：' + fail + ' 条');
process.exit(fail ? 1 : 0);

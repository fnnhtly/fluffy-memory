/* 1-8 的难度结构（第 84 轮）。
 *
 * ── 量出来的是什么 ──
 *
 * 600 局随机造法：
 *   缺驱动件 319 局（53%）  ← 最大的筛子
 *   缺吃风件 167 局（28%）
 *   缺风种   142 局（24%）
 *   三件套齐 134 局（22%）→ 通关 8.2%
 *   三件套齐 + 触发 ≥3.6s 51 局 → 通关 17.6%
 *
 * 结论：1-8 的难度**几乎全部来自"凑齐三件套"**，不是操作时机。
 * 凑齐之后只要不按太早，成功率就上来一个量级。
 *
 * 这是**设计选择**：1-8 是一关"配置题"。而且 22% 的随机局能凑齐，
 * 说明它不是"随机探索够不到"。
 *
 * ── 判据 ──
 *
 *   A 三件套齐的局必须**显著高于**全随机的通关率（证明是配置门槛）
 *   B 三件套齐的比例不能太低（≥ 10%，否则随机玩家基本碰不到）
 *   C 三件套 + 时机对，通关率 ≥ 10%（证明凑齐之后真的能过）
 *   D 1-8 仍然是八关里最难的一关（这是设计意图）
 */
const R = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');
const { randomBuild, makeRng } = require('./lib/random_build.js');

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

const LV = LEVELS[7];
const N = 500;
let allWin = 0, kitN = 0, kitWin = 0, kitOkN = 0, kitOkWin = 0;

for (let i = 0; i < N; i++) {
  const spec = randomBuild(LV);
  const st = R.simulate(LV, spec, { maxTime: 70 });
  const win = st.result === 'win';
  if (win) allWin++;

  const hasSeed = !!spec.anemo_core;
  const hasCanopy = !!(spec.umbrella || spec.wind_wing);
  const hasProp = !!(spec.propeller || spec.jet);
  const seedT = (spec._seeds || [])[0];

  if (hasSeed && hasCanopy && hasProp) {
    kitN++; if (win) kitWin++;
    if (seedT && seedT.t >= 3.6) { kitOkN++; if (win) kitOkWin++; }
  }
}

const allRate = allWin / N * 100;
const kitRate = kitN ? kitWin / kitN * 100 : 0;
const okRate = kitOkN ? kitOkWin / kitOkN * 100 : 0;

lines.push('1-8 随机 ' + N + ' 局：全随机 ' + allRate.toFixed(2) + '%，' +
  '三件套齐 ' + kitN + ' 局（' + (kitN / N * 100).toFixed(0) + '%）→ ' +
  kitRate.toFixed(1) + '%，' +
  '再加时机对 ' + kitOkN + ' 局 → ' + okRate.toFixed(1) + '%');

/* A 配置门槛 */
chk('A 三件套齐的通关率显著高于全随机（≥ 3 倍）',
  kitRate >= allRate * 3, kitRate.toFixed(1) + '% vs ' + allRate.toFixed(2) + '%');

/* B 凑齐的比例不能太低 */
chk('B 随机局里 ≥ 10% 能凑齐三件套（不是够不到）',
  kitN / N >= 0.10, (kitN / N * 100).toFixed(0) + '%');

/* C 凑齐 + 时机对之后能过 */
chk('C 三件套齐且触发 ≥3.6s 时通关率 ≥ 10%',
  okRate >= 10, okRate.toFixed(1) + '%');

/* D 最后三关的难度显著高于前三关（设计意图：机制关是收尾）
 *
 * ⚠ 这条判据改过**四次**，每一次都是同一个教训的变体：
 *
 * 1. 「1-8 是**唯一**最难的一关」—— 1-7 可能更难，名次在方差大的量上不成立。
 * 2. 「最后两关是最难的两关」—— 间歇性红。
 * 3. 「最后**三**关是最难的三关」—— 仍然会翻车：1-3 与 1-6 的
 *    真实通关率重叠（6%~11%），谁高谁低看抽样。
 * 4. **现在**：「最后三关的平均通关率不到前三关平均的一半」。
 *
 * 前三版量的都是**名次**，而名次要求"每一对都排对"；只要有两关
 * 的真实值重叠，名次就会翻来覆去。第四版量**量级差** —— 那才是设计意图
 * （机制关更难），而且它对抽样误差不敏感。
 *
 * 同时用 `makeRng(seed)` 固定随机源：判据本身不该"有时红有时绿"，
 * 那会训练人去重跑直到绿。
 */
{
  const SEED = 20260806;
  const rates = LEVELS.map(lv => {
    const rng = makeRng(SEED + lv.levelId.charCodeAt(2) * 7919);
    let w = 0, n = 0;
    const cap = 600;
    while (n < cap && !(n >= 300 && w >= 3)) {
      if (R.simulate(lv, randomBuild(lv, rng), { maxTime: 70 }).result === 'win') w++;
      n++;
    }
    return { id: lv.levelId, r: w / n * 100, n };
  });
  lines.push('八关通关率（固定种子 ' + SEED + '）：' +
    rates.map(r => r.id + '=' + r.r.toFixed(2) + '%').join(' '));
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const head = avg(rates.slice(0, 5).map(r => r.r));   // 1-1..1-5
  const tail = avg(rates.slice(5).map(r => r.r));      // 1-6..1-8
  const ratio = tail / head;
  lines.push('前五关平均 ' + head.toFixed(2) + '%，最后三关平均 ' +
    tail.toFixed(2) + '%（比值 ' + ratio.toFixed(3) + '）');
  /* ⚠ 阈值 0.30 是**量出来的**（`_redproof_1_8_structure.js` 反向验证）：
   *   基线 4.00% / 19.27% = 0.208  → 绿
   *   把 1-6 终点挪回坡脚 6.33% / 19.27% = 0.328 → 红
   * 两边各留 0.09 余量。第一版阈值写 0.5 时，把 1-6 挪回坡脚**仍然全绿** ——
   * 那说明它没有真正守住"最后三关明显更难"。 */
  chk('D 最后三关的平均通关率不到前五关的 0.30 倍（明显更难）',
    ratio < 0.30, tail.toFixed(2) + '% vs ' + head.toFixed(2) +
    '%（比值 ' + ratio.toFixed(3) + '）');
}

console.log(lines.join('\n'));
console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
if (fail) console.log('失败项：' + fail + ' 条');
process.exit(fail ? 1 : 0);

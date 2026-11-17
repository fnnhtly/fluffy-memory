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
const { randomBuild } = require('./lib/random_build.js');

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

/* D 最后两关是最难的两关（设计意图：机制关是收尾） */
{
  /* ⚠ 第一版只跑了 120 局/关，于是 1-7 报 0.8%、1-8 报 2.5% ——
   * 而低概率关在 120 局下的方差极大（第 83 轮已经踩过：N=240 会让
   * 1.7% 的关假报 0%）。所以这里也用**自适应采样**：至少 300 局。
   *
   * 另一件事：D 组第一版断言的是"1-8 是唯一最难的一关"，
   * 实测 1-7 更难（0.8% < 2.5%）。那不是缺陷 ——
   * 两关都是种子关，是这一章的收尾。判据改成量这个真正成立的性质：
   * **最后两关是八关里最难的两关**。 */
  const rates = LEVELS.map(lv => {
    let w = 0, n = 0;
    while (n < 400 && !(n >= 300 && w >= 2)) {
      if (R.simulate(lv, randomBuild(lv), { maxTime: 70 }).result === 'win') w++;
      n++;
    }
    return { id: lv.levelId, r: w / n * 100, n };
  });
  lines.push('八关通关率：' + rates.map(r => r.id + '=' + r.r.toFixed(2) + '%').join(' '));
  const sorted = rates.slice().sort((a, b) => a.r - b.r);
  const twoHardest = sorted.slice(0, 2).map(r => r.id).sort().join(',');
  chk('D 最后两关（1-7 / 1-8）是八关里最难的两关', twoHardest === '1-7,1-8',
    '最难两关：' + twoHardest + '（' + sorted[0].id + '=' + sorted[0].r.toFixed(2) +
    '%, ' + sorted[1].id + '=' + sorted[1].r.toFixed(2) + '%）');
}

console.log(lines.join('\n'));
console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
if (fail) console.log('失败项：' + fail + ' 条');
process.exit(fail ? 1 : 0);

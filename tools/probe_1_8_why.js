/* 1-8 的 1% 到底是"关卡太难"还是"随机探索够不到"（第 84 轮）。
 *
 * 格子冲突修好之后，1-8 从 0.68% 涨到 1.00%（其余关普遍涨 30~60%）。
 * 但它仍然是最低的。这一轮把它拆到**每一个必要条件**上：
 *
 *   三件套齐了之后，通关率是多少？
 *   如果还是很低，说明还有别的门槛（时机、位置）。
 *   如果已经很高，说明 1-8 的难度就是"凑齐三件套"，那是设计选择。
 */
const R = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');
const { randomBuild } = require('./lib/random_build.js');

const LV = LEVELS[7];
const N = 600;

let kitN = 0, kitWin = 0;
let kitOkN = 0, kitOkWin = 0;
let noSeed = 0, noCanopy = 0, noProp = 0;

for (let i = 0; i < N; i++) {
  const spec = randomBuild(LV);
  const st = R.simulate(LV, spec, { maxTime: 70 });
  const win = st.result === 'win';

  const hasSeed = !!spec.anemo_core;
  const hasCanopy = !!(spec.umbrella || spec.wind_wing);
  const hasProp = !!(spec.propeller || spec.jet);
  const seedT = (spec._seeds || [])[0];

  if (!hasSeed) noSeed++;
  if (!hasCanopy) noCanopy++;
  if (!hasProp) noProp++;

  if (hasSeed && hasCanopy && hasProp) {
    kitN++; if (win) kitWin++;
    /* "完整条件"再加：触发时刻落在 3.6 秒之后 */
    if (seedT && seedT.t >= 3.6) { kitOkN++; if (win) kitOkWin++; }
  }
}

console.log('1-8 随机 ' + N + ' 局');
console.log('  缺风种 ' + noSeed + ' 局，缺吃风件 ' + noCanopy + ' 局，缺驱动件 ' + noProp + ' 局');
console.log('  三件套齐 ' + kitN + ' 局 → 通关 ' + kitWin +
  '（' + (kitN ? (kitWin / kitN * 100).toFixed(1) : 0) + '%）');
console.log('  三件套齐 + 触发 ≥3.6s ' + kitOkN + ' 局 → 通关 ' + kitOkWin +
  '（' + (kitOkN ? (kitOkWin / kitOkN * 100).toFixed(1) : 0) + '%）');

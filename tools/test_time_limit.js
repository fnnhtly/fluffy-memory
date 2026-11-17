/* TDD：限时到底由谁说话？
 *
 * 现状（probe_time_cap / probe_timeout_reach / probe_slow_wins 量出来的）：
 *   · 每关 JSON 都写着 `timeLimit: 120`，**引擎一次都没读过** —— 死字段；
 *   · 引擎用的是全局 `Params.demoTimeLimit = 60`；
 *   · 1440 个随机造法里，`timeout` **一次都没触发**（最久的一局 47.58 秒，
 *     而且那局本来就失败）；把马达加速度一路压到 1.2 m/s²，
 *     最慢的合法通关也只有 22.13 秒。
 *
 * 于是有两个问题，都不是"能不能跑通"，而是"两个真相"：
 *   1. 策划/我改 `levels/*.json` 的 timeLimit 毫无反应 —— 那是假的旋钮；
 *   2. 60 秒这条线对真实玩家是**看不见的**：HUD 的秒表只涨不封，
 *      看门狗只警告"8 秒没进展"，而 60 秒一刀切下来时失败卡写「超时」。
 *      一旦哪天出现一辆"每 7 秒爬 2 米"的慢车（看门狗完全合格），
 *      它就会在毫无预警的情况下被判超时。
 *
 * 修法：限时**以关卡为准**（`lv.timeLimit`），全局值只做兜底。
 * 这样那个字段活了，60 秒的误杀风险也没了（120 秒是实测最慢合法局的 5 倍）。
 *
 * 这份测试先写红再修 —— 下面「量具能失败」那几条在修之前就该红。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const levels = require('../prototype/levels.js');

let pass = 0, fail = 0;
const ck = (ok, name, detail) => {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + ' ' + name + (detail !== undefined ? '　' + detail : ''));
};

console.log('=== 1. 关卡文件里的 timeLimit 现在生效吗？ ===');
{
  /* 造一个"限时 5 秒"的临时关卡：如果引擎读 lv.timeLimit，它必须在 5 秒左右超时；
   * 如果引擎只读全局 60 秒，它就会跑到别的原因（或者跑满 60 秒）。 */
  /* ⚠ 挑哪一关来跑这件事**不能写死**。
   * 第 63 轮重做零件之后，1-6 的标准解从 ~9 秒变成 2.85 秒（气球给了升力、
   * 风车桨给了推力，一路顺风），于是"限时 5 秒"根本来不及触发 ——
   * 车在第 2.85 秒就赢了，压根没走到超时判定。
   *
   * 这不是引擎坏了，是**选错了被测对象**。判据要的是"有一关最慢的解
   * 超过 5 秒"，所以这里先量出每关标准解的耗时，挑最慢的那一关来验。 */
  let slowest = null;
  levels.forEach((lv) => {
    /* ⚠ 第 72 轮：这条查找规则有个洞 —— `indexOf(levelId) === 0` 会把
     * **1-5e / 1-5n / 1-5m 里最先出现的那个**（= 1-5e）当成 1-5 的标准解，
     * 而 1-5 现在自带雷屏障，`1-5n` / `1-5m` 会撞墙。
     * 巧合的是这次挑对了（字母序 e < m < n），但"靠运气对"
     * 和"写对了"是两件事 —— 换成 1-5a 当反例它就挑错。
     *
     * 现在显式给一张表：每一关**能通关**的那条解。
     * 这一支量的是"限时对不对"，用一条过不去的解量出来的都是别的数。 */
    const SPEC_OF = { '1-1': '1-1', '1-2': '1-2', '1-3': '1-3', '1-4': '1-4i',
                      '1-5': '1-5e', '1-6': '1-6', '1-7': '1-7' };
    const key = SPEC_OF[lv.levelId];
    if (!key || !R.SPECS[key]) return;
    const probe = JSON.parse(JSON.stringify(lv));
    probe.timeLimit = 120;
    const rr = R.simulate(probe, R.SPECS[key], { maxTime: 60, params: { progressWindow: 1e9 } });
    const tt = rr.time || 0;
    console.log(`  探针 ${lv.levelId}: ${rr.result} @ ${tt.toFixed(2)} s`);
    if (rr.result !== 'win') return;      // 过不去的解不进"最慢"的候选
    if (!slowest || tt > slowest.t) slowest = { lv, key, t: tt };
  });
  const lv = JSON.parse(JSON.stringify(slowest.lv));
  lv.timeLimit = 5;
  const r = R.simulate(lv, R.SPECS[slowest.key], { maxTime: 60, params: { progressWindow: 1e9 } });
  console.log(`  限时 5 秒的 ${slowest.lv.levelId}（最慢的一关，标准解 ${slowest.t.toFixed(2)}s）` +
              ` → ${r.result}/${r.failReason || '-'} @ ${(r.time || 0).toFixed(2)} s`);
  ck(r.failReason === 'timeout' && r.time <= 5.6,
    `关卡写 timeLimit=5 时，引擎真的在 5 秒左右判超时（用最慢的一关 ${lv.levelId}）`,
    `${r.failReason} @ ${(r.time || 0).toFixed(2)}s`);
}

console.log('\n=== 2. 六关的限时都来自关卡文件（不是那个全局常量） ===');
{
  levels.forEach(lv => {
    const limit = (lv.timeLimit !== undefined && lv.timeLimit !== null)
      ? lv.timeLimit : R.Params.demoTimeLimit;
    console.log(`  ${lv.levelId}: lv.timeLimit=${lv.timeLimit} → 引擎应取 ${limit}`);
  });
  const allFromLevel = levels.every(lv => lv.timeLimit !== undefined);
  ck(allFromLevel, '六关都显式写了 timeLimit（没有一关靠兜底）', allFromLevel ? '6/6' : '有缺失');
}

console.log('\n=== 3. 默认关卡不会因为限时误杀标准解 ===');
{
  levels.forEach((lv) => {
    /* ⚠ 用下标取 key 的那一版在加第 7 关时直接拿不到 key（undefined），
     * 而加雷屏障之后 1-5m 也过不去了。改成按 levelId 查表。 */
    const SPEC_OF = { '1-1': '1-1', '1-2': '1-2', '1-3': '1-3', '1-4': '1-4i',
                      '1-5': '1-5e', '1-6': '1-6', '1-7': '1-7' };
    const key = SPEC_OF[lv.levelId];
    if (!key || !R.SPECS[key]) {
      ck(`  ${lv.levelId} 有标准解`, false, '缺 SPECS[' + key + ']');
      return;
    }
    const r = R.simulate(lv, R.SPECS[key], { maxTime: 300 });
    ck(r.result === 'win', `  ${lv.levelId} 标准解在 ${lv.timeLimit} 秒限时内通关`,
      `${r.result}/${r.failReason || '-'} @ ${(r.time || 0).toFixed(2)}s`);
  });
}

console.log('\n=== 4. 量具能失败：把上限压到 1 秒，标准解必须被判超时 ===');
{
  const lv = JSON.parse(JSON.stringify(levels[0]));
  lv.timeLimit = 1;
  const r = R.simulate(lv, R.SPECS['1-1'], { maxTime: 60 });
  ck(r.failReason === 'timeout', '限时压到 1 秒 → 1-1 标准解判 timeout',
    `${r.result}/${r.failReason || '-'} @ ${(r.time || 0).toFixed(2)}s`);
}

console.log('\n=== 5. 量具能失败：没有 timeLimit 的关卡回落到全局值 ===');
{
  const lv = JSON.parse(JSON.stringify(levels[0]));
  delete lv.timeLimit;
  const r = R.simulate(lv, R.SPECS['1-1'], { maxTime: 300, params: { demoTimeLimit: 1.5 } });
  ck(r.failReason === 'timeout',
    '关卡没写 timeLimit 时，回落到 Params.demoTimeLimit（1.5 秒）',
    `${r.result}/${r.failReason || '-'} @ ${(r.time || 0).toFixed(2)}s`);
}

console.log('\n=== 6. 上限仍然远大于实测最慢的合法通关（22.13 秒） ===');
{
  const worstLegit = 22.13;
  const minLimit = Math.min.apply(null, levels.map(lv => lv.timeLimit));
  ck(minLimit >= worstLegit * 3,
    '最短的关卡限时也至少有"最慢合法局"的 3 倍余量',
    `最短限时 ${minLimit}s vs 最慢合法局 ${worstLegit}s`);
}

console.log('\nASSERTS ' + pass + ' / ' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);

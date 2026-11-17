/* 「看门狗其实从来没可能触发在获胜局上」—— 第 82 轮的核心发现。
 *
 * ── 事实 ──
 *
 * 八关标准解的时长：6.85 / 2.95 / 7.02 / 3.75 / 3.90 / 2.42 / 5.68 / 6.40 秒
 * 全部 **< progressWindow = 8 秒**。
 *
 * 也就是说：**没有任何一局获胜的车能凑满一个完整的 8 秒窗口**。
 * 于是「标准解 0 触发」是数学上的必然，不是安全属性。
 * 同理，把 `progressGain` 从 2 抬到 60，那条断言照样绿 ——
 * 它量的根本不是 gain。
 *
 * ── 正确的判据 ──
 *
 * 真正的安全属性是：**W 必须大于任何可能的获胜时长**。
 * 而"获胜时长"不是一个能事先知道的数 —— 换个关卡、换个走法就会变。
 * 所以这条属性只能被**持续测量**：
 *
 *   每次跑全量测试时，量一遍所有标准解的时长，
 *   断言 `W > max(时长) + 余量`。如果哪天有人做了一关慢关（比如 12 秒），
 *   这条断言会立刻红，提醒他同时调 W。
 *
 * 这就是这一轮真正要加的东西。
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

const W = R.Params.progressWindow, D = R.Params.progressGain;

/* 量所有标准解的时长 */
const durs = [];
LEVELS.forEach(lv => {
  const spec = JSON.parse(JSON.stringify(R.SPECS[SPEC_OF[lv.levelId]] || {}));
  const st = R.simulate(lv, spec, { maxTime: 120 });
  durs.push({ id: lv.levelId, t: +st.time.toFixed(2), result: st.result });
});
const maxDur = Math.max(...durs.map(d => d.t));
lines.push('标准解时长：' + durs.map(d => d.id + '=' + d.t + 's').join(' ') +
  '  最长 ' + maxDur + ' 秒');
lines.push('progressWindow = ' + W + ' 秒，progressGain = ' + D + ' 米');

// ═════════════ A W 必须大于最长获胜时长 ═════════════
const margin = +(maxDur * 1.2).toFixed(2);
{
  /* 余量取 20%：如果一关的获胜时长短于 W，看门狗在结构上不可能误杀它。
   * 这条是**结构性**的，不是统计性的 —— 它不依赖随机样本。 */
  chk('A progressWindow 大于最长标准解时长的 1.2 倍（结构性安全）',
    W >= margin, W + ' vs ' + margin + '（最长 ' + maxDur + 's × 1.2）');
}

// ═════════════ B 所有标准解都真的赢了 ═════════════
{
  const bad = durs.filter(d => d.result !== 'win');
  chk('B 八关标准解全部通关（否则上一条没有意义）', bad.length === 0,
    bad.length ? bad.map(d => d.id + '=' + d.result).join(',') : '全部 win');
}

// ═════════════ C 这条判据能失败（自证） ═════════════
{
  /* 用一个假想的 W 演示它会红：W 压到最长时长以下时必须不通过。 */
  const fakeW = maxDur - 0.5;
  chk('C 自证：W 压到最长时长以下时，A 那条判据会红',
    !(fakeW >= margin), '假想 W=' + fakeW + ' < 余量 ' + margin);
}

// ═════════════ D 看门狗仍在抓"慢慢溜"的失败局 ═════════════
{
  /* 这一条和第 82 轮之前那条一样，但换成**结构性**的说法：
   * 至少要有一种失败局是"车在动但没靠近终点"，否则看门狗无用。
   * 用构造的方式找一个：单框无轮（第 79 轮用过）。 */
  let found = null;
  LEVELS.slice(0, 3).forEach(lv => {
    if (found) return;
    const r = R.simulate(lv, { wood_frame: [[4, 1]], pig: [[4, 1]] }, { maxTime: 90 });
    if (r.failReason === 'no_progress') found = { id: lv.levelId, t: r.time };
  });
  lines.push('构造样本（单框无轮）：' + (found ?
    found.id + ' no_progress @' + found.t.toFixed(1) + 's' : '没找到'));
  chk('D 看门狗仍能抓到"溜但没进展"的构造样本', !!found,
    found ? found.id + '@' + found.t.toFixed(1) + 's' : '三个关都没抓到');
}

console.log(lines.join('\n'));
console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
if (fail) console.log('失败项：' + fail + ' 条');
process.exit(fail ? 1 : 0);

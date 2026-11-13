/* 共用断言器：让每个浏览器测试脚本都能"真的失败"。
 *
 * 为什么需要它：
 *   之前 15 个 test_*.js 的写法是 `out.push('xxx = ' + value)` 然后
 *   `process.exit(0)`。verify.mjs 只检查 `errors: (none)`，
 *   于是"场景其实什么都没发生"也算通过 —— 这是比 bug 更糟的一类问题：
 *   它让整个回归套件失去意义。
 *
 * 用法：
 *   const A = require('./lib/asserts');
 *   A.chk('零件落在格子上', n === 6, '实际 ' + n);
 *   ...
 *   A.finish(ws, child);        // 全部通过 exit 0，否则 exit 1
 *
 * 关键约定：`finish()` 会打印 `ASSERTS <通过> / <总数>`，
 * verify.mjs 用它确认"这个脚本真的断言过东西"，而不是空跑。
 */

const state = { pass: 0, fail: 0, lines: [], failures: [] };

function chk(label, cond, extra) {
  const ok = !!cond;
  if (ok) state.pass++; else { state.fail++; state.failures.push(label); }
  state.lines.push((ok ? '✓ ' : '✗ ') + label + (extra ? '  ' + extra : ''));
  return ok;
}

/* 数值断言：把"大致相等"写成明确的容差，免得用 > 号糊过去 */
function near(label, actual, expect, tol, unit) {
  const d = Math.abs(actual - expect);
  return chk(label, d <= tol,
    (typeof actual === 'number' ? actual.toFixed(4) : actual) + ' vs ' +
    (typeof expect === 'number' ? expect.toFixed(4) : expect) +
    (unit ? ' ' + unit : '') + '  差 ' + (typeof d === 'number' ? d.toFixed(4) : d));
}

/* 区间断言 */
function within(label, actual, lo, hi, unit) {
  return chk(label, actual >= lo && actual <= hi,
    actual + (unit ? ' ' + unit : '') + ' ∈ [' + lo + ', ' + hi + ']');
}

/* 一组"必须全真"的条件，报出第一个不满足的 */
function all(label, pairs) {
  for (const [sub, cond] of pairs) if (!cond) return chk(label, false, '不满足：' + sub);
  return chk(label, true, pairs.length + ' 项');
}

function log(msg) { state.lines.push(msg); }

/* 收尾：打印、判定、退出。errs = 页面异常列表，非空必然失败。 */
function finish(ws, child, errs) {
  console.log(state.lines.join('\n'));
  const e = errs || [];
  console.log('ASSERTS ' + state.pass + ' / ' + (state.pass + state.fail));
  console.log('errors:', e.length ? e.join(' | ') : '(none)');
  if (state.fail) console.log('失败项：' + state.failures.join(' / '));
  try { ws && ws.close(); } catch (x) {}
  try { child && child.kill(); } catch (x) {}
  process.exit(state.fail === 0 && e.length === 0 ? 0 : 1);
}

module.exports = { chk, near, within, all, log, finish, state };

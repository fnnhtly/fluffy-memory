/* 回归脚本「通过与否」的判定规则 —— 单独抽出来，因为它自己也需要被证明。
 *
 * 历史教训：verify.mjs 原来只 grep `errors: (none)` 就算通过，
 * 于是 15 个 test_*.js 全部是 `out.push(...)` + `process.exit(0)`：
 * 场景里什么都没发生、车一动不动、按钮一个没点上，也全绿。
 * 这比 bug 更糟 —— 它让整套回归失去意义。
 *
 * 现在的规则（三条缺一不可）：
 *   1. 进程退出码 0；
 *   2. 输出里有 `errors: (none)`；
 *   3. 输出里有 `ASSERTS n / n`（n>0 且相等），**没有这一行就算失败**。
 */

function verdict(out, exitOk) {
  const text = out || '';
  const hasErr = /errors: \(none\)/.test(text);
  const m = text.match(/ASSERTS (\d+) \/ (\d+)/);
  if (!m) {
    return { ok: false, reason: exitOk ? '没有断言（退回只打印模式）' : '崩溃或超时' };
  }
  const pass = Number(m[1]);
  const total = Number(m[2]);
  if (!exitOk) return { ok: false, reason: '退出码非 0' };
  if (!hasErr) return { ok: false, reason: '有页面异常' };
  if (total === 0) return { ok: false, reason: '断言数为 0' };
  if (pass !== total) return { ok: false, reason: `半成功 ${pass}/${total}` };
  return { ok: true, reason: `断言 ${pass}/${total}` };
}

module.exports = { verdict };

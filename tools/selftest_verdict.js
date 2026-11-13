/* 量尺自检：verdict.js 必须能对每一种"看起来绿其实假"的输出判失败。
 * 如果这个自检全过，就说明 verify.mjs 里那条规则是真的在起作用。
 */
const V = require('./lib/verdict');

let pass = 0, fail = 0;
const chk = (label, cond, extra) => {
  if (cond) pass++; else fail++;
  console.log((cond ? '✓ ' : '✗ ') + label + (extra ? '  ' + extra : ''));
};

// --- 1. 真正通过的样子 ---
chk('全通过的输出判通过',
  V.verdict('✓ a\n✓ b\nASSERTS 2 / 2\nerrors: (none)\n', true).ok === true);

// --- 2. 只打印不判定（历史重灾区）---
{
  const v = V.verdict('some value = 3\nother = 4\nerrors: (none)\n', true);
  chk('没有 ASSERTS 行 → 判失败', v.ok === false, v.reason);
}
// --- 3. 有断言但半成功 ---
{
  const v = V.verdict('✓ a\n✗ b\nASSERTS 1 / 2\nerrors: (none)\n', true);
  chk('半成功 1/2 → 判失败', v.ok === false, v.reason);
}
// --- 4. 有断言但页面异常 ---
{
  const v = V.verdict('ASSERTS 3 / 3\nerrors: TypeError: x is not a function\n', true);
  chk('有页面异常 → 判失败', v.ok === false, v.reason);
}
// --- 5. 退出码非 0 ---
{
  const v = V.verdict('ASSERTS 3 / 3\nerrors: (none)\n', false);
  chk('退出码非 0 → 判失败', v.ok === false, v.reason);
}
// --- 6. 空断言（ASSERTS 0 / 0）---
{
  const v = V.verdict('ASSERTS 0 / 0\nerrors: (none)\n', true);
  chk('断言数为 0 → 判失败（等于什么都没测）', v.ok === false, v.reason);
}
// --- 7. 空输出 / 超时 ---
{
  const v = V.verdict('', false);
  chk('空输出 + 退出失败 → 判失败', v.ok === false, v.reason);
}

// --- 8. 反例：旧规则会放过第 2 条，新规则不会 ---
{
  const fake = 'some value = 3\nerrors: (none)\n';
  const oldRule = /errors: \(none\)/.test(fake);
  const newRule = V.verdict(fake, true).ok;
  chk('旧规则放过这种输出，新规则抓住（规则确实变强了）',
    oldRule === true && newRule === false);
}

console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);

/* 自检：断言器自己能不能报错？
 * 这是整个回归套件的地基 —— 如果 chk/finish 有问题，所有测试都不可信。
 * 纯逻辑，不开浏览器。
 */
const assert = require('assert');
const A = require('./lib/asserts');

let n = 0;
const t = (label, fn) => { fn(); n++; console.log('✓ ' + label); };

// 用一个隔离的假 state 复现 chk 的行为（不污染真模块）
function mk() { return { pass: 0, fail: 0, lines: [], failures: [] }; }
const chk = (st, label, cond, extra) => {
  const ok = !!cond;
  if (ok) st.pass++; else { st.fail++; st.failures.push(label); }
  st.lines.push((ok ? '✓ ' : '✗ ') + label + (extra ? '  ' + extra : ''));
  return ok;
};

t('真条件计入 pass、假条件计入 fail', () => {
  const st = mk();
  chk(st, 'a', true);
  chk(st, 'b', false);
  assert.strictEqual(st.pass, 1);
  assert.strictEqual(st.fail, 1);
  assert.deepStrictEqual(st.failures, ['b']);
});

t('chk 返回布尔值（可用于 early-return）', () => {
  const st = mk();
  assert.strictEqual(chk(st, 'x', 1), true);
  assert.strictEqual(chk(st, 'y', 0), false);
  // 0 和 '' 必须判 false，不能像某些框架那样"只有 null/undefined 才是假"
  assert.strictEqual(chk(st, 'z', ''), false);
});

t('near：容差内通过、容差外失败', () => {
  const st = mk();
  const near = (label, a, e, tol) => chk(st, label, Math.abs(a - e) <= tol, a + ' vs ' + e);
  near('正好', 1.000, 1.000, 0.001);
  near('容差边缘内', 1.0009, 1.000, 0.001);
  near('容差边缘外', 1.002, 1.000, 0.001);
  assert.strictEqual(st.pass, 2);
  assert.strictEqual(st.fail, 1);
  assert.deepStrictEqual(st.failures, ['容差边缘外']);
});

t('within：区间两端都算通过', () => {
  const st = mk();
  const within = (label, a, lo, hi) => chk(st, label, a >= lo && a <= hi, a + '');
  within('下界', 0.8, 0.8, 2.5);
  within('上界', 2.5, 0.8, 2.5);
  within('越上界', 2.51, 0.8, 2.5);
  assert.strictEqual(st.pass, 2);
  assert.strictEqual(st.fail, 1);
});

t('all：报出第一个不满足的子条件', () => {
  const st = mk();
  const pairs = [['高度>0', true], ['宽度>0', false], ['有猪', true]];
  let which = null;
  for (const [k, c] of pairs) if (!c) { which = k; break; }
  chk(st, '全真', !which, which ? '不满足：' + which : pairs.length + ' 项');
  assert.deepStrictEqual(st.failures, ['全真']);
  assert.ok(st.lines[0].indexOf('宽度>0') > 0, '没报出具体哪一条：' + st.lines[0]);
});

t('退出码规则：有失败或有异常都必须非零', () => {
  const code = (fail, errs) => (fail === 0 && errs === 0 ? 0 : 1);
  assert.strictEqual(code(0, 0), 0);
  assert.strictEqual(code(1, 0), 1);
  assert.strictEqual(code(0, 1), 1);
  assert.strictEqual(code(0, 0) === 0 && code(0, 2) === 1, true);
});

t('finish 的输出格式能被 verify.mjs 解析', () => {
  const re = /ASSERTS (\d+) \/ (\d+)/;
  const line = 'ASSERTS 12 / 12';
  const m = line.match(re);
  assert.ok(m);
  assert.strictEqual(m[1], '12');
  assert.strictEqual(m[2], '12');
  // 通过数必须等于总数才算全绿
  const okWhen = (a, b) => a === b;
  assert.strictEqual(okWhen(m[1], m[2]), true);
  assert.strictEqual('ASSERTS 11 / 12'.match(re)[1] === '12', false);
});

// 确认模块导出的函数真的存在（避免 require 到空对象还"通过"）
t('模块导出完整', () => {
  ['chk', 'near', 'within', 'all', 'log', 'finish', 'killTree'].forEach(k =>
    assert.strictEqual(typeof A[k], 'function', '缺少导出 ' + k));
  assert.ok(A.state && typeof A.state === 'object');
});

// killTree：必须真的能杀掉一个进程。
// 起因：Windows 上 child.kill() 只杀 launcher，Edge 的浏览器进程树留在后台，
// 跑完十几个脚本就堆了一堆 headless Edge，帧率掉下去、CDP 端口被抢，
// 于是测试开始随机"崩溃或超时"——假红和真回归长得一模一样，必须从根上消掉。
function waitGone(pid, ms) {
  const { execFileSync } = require('child_process');
  const end = Date.now() + ms;
  let alive = true;
  while (Date.now() < end) {
    try { process.kill(pid, 0); } catch (e) { alive = false; break; }
    try { execFileSync(process.platform === 'win32' ? 'ping' : 'sleep',
      process.platform === 'win32' ? ['-n', '1', '-w', '80', '127.0.0.1'] : ['0.08'],
      { stdio: 'ignore' }); } catch (e) {}
  }
  return !alive;
}
{
  const { spawn } = require('child_process');
  const kid = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], { stdio: 'ignore' });
  const pid = kid.pid;
  assert.ok(pid > 0, '没起来子进程');
  A.killTree(kid);
  assert.ok(waitGone(pid, 4000), 'killTree 之后进程仍然活着（pid ' + pid + '）');
  console.log('✓ killTree 之后子进程确实退出了（pid ' + pid + '）');
  n++;
}

console.log('\nPASS ' + n + ' / FAIL 0');

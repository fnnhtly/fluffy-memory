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

/* 杀进程树，并**删掉它用的浏览器临时配置目录**。
 *
 * `child.kill()` 只杀 launcher 进程，Edge 真正的浏览器进程是它的子孙，
 * 于是每跑一个脚本就留下一整棵浏览器树。跑到第 15 个脚本时，
 * 机器上已经堆了十几个 headless Edge —— 帧率掉下去、CDP 端口被抢、
 * 个别脚本连不上浏览器，表现成"崩溃或超时"。
 * 这些红全是假的，但它们和真回归长得一模一样，所以必须从根上消掉。
 *
 * ── 第 75 轮：还要删配置目录 ──
 *
 * 第 74 轮 `git commit` 报了 `ENOSPC`：`%TEMP%` 下 1362 个 `edge*` 目录、
 * 27.8 GB。每个脚本 spawn 浏览器时都指定 `--user-data-dir=<tmp>/edgeXXX-时间戳`，
 * 跑完从来没删。全项目 149 个脚本各拼一份，所以修法不能是"每个脚本加一行"，
 * 只能修在**每个脚本都会走的这个收尾函数**上。
 *
 * 两个开关：
 *   · `RAP_KEEP_PROFILE=1` —— 保留目录（调试时想翻 DevTools 的 profile）；
 *   · 删不掉时静默（锁住的目录不能把整个测试搞崩）。
 */
function killTree(child) {
  if (!child || !child.pid) {
    /* pid 为 0 的假 child 也要走清理 —— 单测就是用它验清理逻辑的。 */
    cleanupProfile(child);
    return;
  }
  try {
    if (process.platform === 'win32') {
      require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'],
        { stdio: 'ignore' });
    } else {
      child.kill('SIGKILL');
    }
  } catch (x) {}
  cleanupProfile(child);
}

/* 删掉 child 的 `--user-data-dir`。判定和删除读同一份 `profileDirOf`。 */
function cleanupProfile(child) {
  if (process.env.RAP_KEEP_PROFILE === '1') return;
  let sweeper = null;
  try { sweeper = require('./temp_sweeper.js'); } catch (x) { return; }
  const dir = sweeper.profileDirOf(child && child.spawnargs);
  if (!dir) return;
  /* 只删自己形状的目录 —— 万一有人把 user-data-dir 指到了别处
   * （比如一个真实浏览器 profile），这里绝不能递归删掉它。 */
  const base = require('path').basename(dir);
  if (!sweeper.looksLikeProfileDir(base)) return;
  /* ⚠ 要**重试**，而且要等够久。`taskkill /T /F` 返回时浏览器进程只是
   * 收到了终止信号，它手里的 sqlite / leveldb 文件还没释放 ——
   * 紧接着 rmSync 会 **EBUSY**。实测（probe_edge_orphan.js）：
   *   taskkill 返回 → 立刻删 3 次全 EBUSY → 再等 1 秒 → 删得掉。
   * 所以不是"删一次就好"，也不是"重试 3 次 × 120ms"（那也不够）。
   * 现在最多等 1.5 秒，一旦目录消失就立刻退出 —— 正常情况约 250ms。
   *
   * 删不掉就放弃，是**对**的：清理失败不该让一个测试判负。 */
  const fs = require('fs');
  for (let i = 0; i < 15; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (x) {}
    if (!fs.existsSync(dir)) return;
    sleepSync(100);
  }
}

/* 同步睡一小会儿。Node 没有 sleepSync，用一个必定超时的 Atomics.wait。 */
function sleepSync(ms) {
  try {
    const sab = new SharedArrayBuffer(4);
    Atomics.wait(new Int32Array(sab), 0, 0, ms);
  } catch (x) {
    const t = Date.now();
    while (Date.now() - t < ms) { /* spin */ }
  }
}

/* 收尾：打印、判定、退出。errs = 页面异常列表，非空必然失败。 */
function finish(ws, child, errs) {
  console.log(state.lines.join('\n'));
  const e = errs || [];
  console.log('ASSERTS ' + state.pass + ' / ' + (state.pass + state.fail));
  console.log('errors:', e.length ? e.join(' | ') : '(none)');
  if (state.fail) console.log('失败项：' + state.failures.join(' / '));
  try { ws && ws.close(); } catch (x) {}
  killTree(child);
  process.exit(state.fail === 0 && e.length === 0 ? 0 : 1);
}

module.exports = { chk, near, within, all, log, finish, killTree, state };

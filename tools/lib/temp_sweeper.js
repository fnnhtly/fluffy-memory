/* 浏览器临时配置目录的清扫器（第 75 轮）。
 *
 * ── 为什么需要这个文件 ──
 *
 * 第 74 轮 `git commit` 报了 `ENOSPC: no space left on device`。
 * 查下来 `%TEMP%` 里有 **1362 个** `edge*` 目录，占 27.8 GB ——
 * 每一个是某次测试启动 headless Edge 时 `--user-data-dir=` 指定的配置目录，
 * 脚本跑完从来没删过。
 *
 * 全项目 149 个脚本各自 spawn 浏览器，所以修法**不能**是"在每个脚本里
 * 各加一行清理" —— 那必然漏掉几个（第 72 轮已经证明过这种扩散的代价）。
 * 两层：
 *   1. `asserts.js` 的 `killTree()` —— 每个脚本都会走的唯一收尾路径，
 *      那里就地删掉"这一个 child 用的那个目录"；
 *   2. 这个清扫器 —— 兜住"上一次跑崩了/被 Ctrl-C 打断"留下的孤儿目录。
 *
 * ── 判据只认形状，不认位置 ──
 *
 * `looksLikeProfileDir(name)` 必须**只**认本项目产生的名字：
 * `edge<前缀>-<毫秒时间戳>`。它不认 `edge`、不认 `node-compile-cache`、
 * 也不认别的程序的目录 —— 一个误删别人的临时目录的清扫器比不清理更坏。
 */

/* 名字形状：edge 前缀 + 至少一个字母/数字前缀 + '-' + 13 位毫秒时间戳。
 *
 * ⚠ 为什么要求后面还有一段字母数字：`edge` 本身、`edge-cases`、
 * `edgeWater` 这类名字不该被当成我们的目录。我们自己的写法是
 * `'edge' + Tag + '-' + Date.now()`，Tag 是字母（SeedBtn / WindFx / Tap …）。 */
const NAME_RE = /^edge[A-Za-z0-9]{1,24}-\d{10,16}$/;

function looksLikeProfileDir(name) {
  if (typeof name !== 'string') return false;
  return NAME_RE.test(name);
}

/* 扫一遍 tmpdir，把符合形状的目录删掉。
 *
 * 返回 { scanned, matched, removed, bytesFreed, errors }。
 * **永不抛异常** —— 清理失败不该把调用方搞崩。
 *
 * 参数：
 *   opts.dir     要扫的目录（默认 os.tmpdir()）
 *   opts.dryRun  只统计不删
 *   opts.minAgeMs 只删"这么旧"的目录（默认 0；测试用它避免删掉正在跑的）
 */
function sweep(opts) {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const o = opts || {};
  const dir = o.dir || os.tmpdir();
  const out = { scanned: 0, matched: 0, removed: 0, bytesFreed: 0, errors: [] };
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) {
    out.errors.push('readdir: ' + e.message);
    return out;
  }
  const now = Date.now();
  names.forEach(n => {
    out.scanned++;
    if (!looksLikeProfileDir(n)) return;
    const p = path.join(dir, n);
    let st = null;
    try { st = fs.statSync(p); } catch (e) { return; }
    if (!st.isDirectory()) return;
    out.matched++;
    if (o.minAgeMs && (now - st.mtimeMs) < o.minAgeMs) return;
    /* 先量一下体积，这样"省了多少"是可数的。量不出来也不影响删。 */
    let bytes = 0;
    try { bytes = dirSize(p); } catch (e) {}
    if (!o.dryRun) {
      try { fs.rmSync(p, { recursive: true, force: true }); }
      catch (e) { out.errors.push(n + ': ' + e.message); return; }
    }
    out.removed++;
    out.bytesFreed += bytes;
  });
  return out;
}

function dirSize(p) {
  const fs = require('fs');
  const path = require('path');
  let total = 0;
  const stack = [p];
  while (stack.length) {
    const cur = stack.pop();
    let ents = [];
    try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch (e) { continue; }
    ents.forEach(e => {
      const q = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(q);
      else { try { total += fs.statSync(q).size; } catch (x) {} }
    });
  }
  return total;
}

/* 从一个 spawn 参数数组里取出 `--user-data-dir=` 的值。没有就返回 null。
 * `killTree()` 用它决定删哪个目录 —— 判定和删除读同一个来源。 */
function profileDirOf(spawnargs) {
  if (!Array.isArray(spawnargs)) return null;
  for (const a of spawnargs) {
    if (typeof a === 'string' && a.indexOf('--user-data-dir=') === 0) {
      const v = a.slice('--user-data-dir='.length);
      return v || null;
    }
  }
  return null;
}

module.exports = { looksLikeProfileDir, sweep, dirSize, profileDirOf, NAME_RE };

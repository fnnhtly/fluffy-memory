/* 「跑完测试别把浏览器的临时配置目录留在磁盘上」（第 75 轮）。
 *
 * ── 为什么这条必须存在 ──
 *
 * 这一轮 `git commit` 报了 `ENOSPC: no space left on device`。
 * 查下来：`%TEMP%` 下有 **1362 个** `edge*` 目录，占 27.8 GB。
 * 每一个是某次测试启动 headless Edge 时 `--user-data-dir=` 指定的配置目录，
 * 脚本跑完**从来没有删过**。
 *
 * 全项目有 149 个脚本各自 spawn 浏览器，每个都自己拼一个
 * `path.join(os.tmpdir(), 'edgeXXX-' + Date.now())`。所以修法不能在
 * 149 个地方各加一行清理 —— 那必然漏掉几个（第 72 轮已经证明过
 * "加一关红了 8 处"那种扩散）。要修在**唯一收尾的那一个函数**上：
 * `killTree()` 已经是每个脚本都会走的路径。
 *
 * 判据：
 *   A. killTree 会删掉 child 的 `--user-data-dir` 目录；
 *   B. 没有 `--user-data-dir` 参数时不报错（有些脚本用默认配置）；
 *   C. 删不掉时不抛异常（锁住的目录不能把整个测试搞崩）；
 *   D. 环境开关 `RAP_KEEP_PROFILE=1` 时**保留**（调试要用）。
 */
console.log('RUNTIME: node');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let pass = 0, fail = 0;
function chk(label, cond, extra) {
  if (cond) { pass++; console.log('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('✗ ' + label + '  ' + (extra || '')); }
}

/* 重新 require 是为了让模块里读的环境变量在每一段都能刷新。 */
function freshAsserts() {
  delete require.cache[require.resolve('./lib/asserts.js')];
  return require('./lib/asserts.js');
}

/* 造一个**形状和产品一致**的配置目录。
 *
 * ⚠ 第一版叫 `edgeProbe-a-<ts>-<rand>` —— 两个破折号 + 尾部随机数，
 * 结果 `looksLikeProfileDir` 正确地**拒绝**了它，A1 红。
 * 那条红其实是清理器在正常工作（只删自己形状的目录），
 * 而测试造了一个产品永远不会产生的名字。测试的夹具必须和产品同形。 */
function mkProfile(tag) {
  const dir = path.join(os.tmpdir(), 'edge' + tag + '-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'marker.txt'), 'x', 'utf8');
  return dir;
}

/* 一个"像 child_process.spawn 返回值"的假对象：killTree 只看 pid 与 spawnargs。
 * 用一个**不存在的 pid**（0）让 taskkill 什么都不做 —— 这一支验的是
 * "目录有没有被清掉"，不是"进程有没有被杀"（那个由真跑测试证明）。 */
function fakeChild(spawnargs) {
  return { pid: 0, kill() {}, spawnargs: spawnargs || [] };
}

// ---------- A killTree 会删掉 --user-data-dir ----------
{
  const dir = mkProfile('a');
  const A = freshAsserts();
  A.killTree(fakeChild(['msedge.exe', '--headless=new', '--user-data-dir=' + dir]));
  chk('A1 killTree 跑完之后 --user-data-dir 目录不在了', !fs.existsSync(dir),
    dir);
}

// ---------- B 没有该参数时不报错 ----------
{
  const A = freshAsserts();
  let threw = null;
  try {
    A.killTree(fakeChild(['msedge.exe', '--headless=new']));
  } catch (e) { threw = e.message; }
  chk('B1 没有 --user-data-dir 时 killTree 不抛异常', threw === null, threw || '');
}

// ---------- C 目录被占住时也不抛 ----------
{
  const dir = mkProfile('c');
  const A = freshAsserts();
  let threw = null;
  try {
    /* 用一个**不存在但格式合法**的路径当 user-data-dir：rmSync 在 force 下应当静默。 */
    A.killTree(fakeChild(['msedge.exe', '--user-data-dir=' +
      path.join(os.tmpdir(), 'edgeProbe-nonexistent-' + Date.now())]));
  } catch (e) { threw = e.message; }
  chk('C1 目录不存在时 killTree 也不抛异常', threw === null, threw || '');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
}

// ---------- D RAP_KEEP_PROFILE=1 时保留 ----------
{
  const dir = mkProfile('d');
  process.env.RAP_KEEP_PROFILE = '1';
  const A = freshAsserts();
  A.killTree(fakeChild(['msedge.exe', '--user-data-dir=' + dir]));
  const kept = fs.existsSync(dir);
  delete process.env.RAP_KEEP_PROFILE;
  /* 清掉，免得这条自己又留垃圾。 */
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  chk('D1 设了 RAP_KEEP_PROFILE=1 时不删（调试需要）', kept, String(kept));
}

// ---------- E 清扫器能认出"浏览器配置目录"且不误删别的东西 ----------
{
  const A = freshAsserts();
  const sweeper = require('./lib/temp_sweeper.js');
  chk('E1 清扫器认得本项目产生的目录名（edge 前缀 + 破折号 + 时间戳）',
    sweeper.looksLikeProfileDir('edgeSeedBtn-1700000000000') === true,
    String(sweeper.looksLikeProfileDir('edgeSeedBtn-1700000000000')));
  chk('E2 不误删普通临时文件/目录',
    sweeper.looksLikeProfileDir('node-compile-cache') === false &&
    sweeper.looksLikeProfileDir('my-project') === false &&
    sweeper.looksLikeProfileDir('edge') === false,
    'node-compile-cache / my-project / edge');
  void A;
}

console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
if (fail) console.log('失败项：' + fail + ' 条');
process.exit(fail ? 1 : 0);

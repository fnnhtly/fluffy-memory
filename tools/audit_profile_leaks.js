/* 查：verify 里跑的那些脚本，有哪些 spawn 了浏览器却不收尾？
 *
 * 第 75 轮的教训：149 个脚本各自 spawn headless Edge、各自拼一个
 * `--user-data-dir`，跑完从来没删 —— `%TEMP%` 涨到 27.8 GB，
 * 最后 `git commit` 报 ENOSPC。
 *
 * 修法在 `tools/lib/asserts.js` 的 `killTree()`（每个脚本唯一的收尾口）。
 * 这个脚本只负责**列出**没走那个口的脚本，免得以后再漏。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const v = fs.readFileSync(path.join(__dirname, 'verify.mjs'), 'utf8');
const items = [...v.matchAll(/'([a-z0-9_]+\.js)'/g)].map(m => m[1]);

const spawnRe = /spawn\(\s*EDGE|spawn\(['"]C:/;
const cleanRe = /A\.finish|killTree/;

const leaks = [];
const noSpawn = [];
items.forEach(f => {
  const p = path.join(__dirname, f);
  if (!fs.existsSync(p)) return;
  const c = fs.readFileSync(p, 'utf8');
  const spawns = spawnRe.test(c);
  const cleans = cleanRe.test(c);
  if (spawns && !cleans) leaks.push(f);
  if (!spawns) noSpawn.push(f);
});

console.log('verify 里登记的脚本：' + items.length + ' 个');
console.log('  其中 spawn 浏览器的：' + (items.length - noSpawn.length));
console.log('  纯 Node（不开浏览器）：' + noSpawn.length);
console.log('');
if (leaks.length) {
  console.log('⚠ 下列脚本 spawn 了浏览器但**没有**走 A.finish / killTree：');
  leaks.forEach(f => console.log('    ' + f));
  console.log('');
  console.log('  这些脚本每跑一次就在 %TEMP% 留下一个 edge* 配置目录。');
  process.exit(1);
} else {
  console.log('✓ 每个 spawn 浏览器的脚本都会经过 killTree —— 不会有目录泄漏');
}

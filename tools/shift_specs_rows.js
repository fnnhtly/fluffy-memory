/* 把 game.js 里 SPECS 的零件行号整体平移 dr 行。
 *
 * 为什么要平移：`partPos()` 是 `y = (BUILD_ROWS-1)/2 - r`，
 * 所以 BUILD_ROWS 一变，同样行号对应的**局部坐标**就跟着变，
 * 而力矩是按局部坐标算的 —— 物理会变，虽然世界位置不变。
 * 反过来，只要把 SPECS 的行号按 (ROWS差)/2 一起挪，局部坐标逐位不变，
 * 物理就完全不变（tools/probe_row_shift.js 会验证这一点）。
 *
 * 只改"数组形式 [r, c]"的第一项；_stacks / _drops / _dirs / _presses
 * 这些下划线键一个字都不动。
 *
 * 用法：node tools/shift_specs_rows.js -1
 */
const fs = require('fs');
const path = require('path');

const dr = parseInt(process.argv[2] || '0', 10);
if (!dr) { console.log('用法: node tools/shift_specs_rows.js <delta>'); process.exit(1); }

const P = path.join(__dirname, '..', 'prototype', 'game.js');
const src = fs.readFileSync(P, 'utf8');

// 定位 SPECS = { ... } 这一块
const startMark = 'var SPECS = {';
const i = src.indexOf(startMark);
if (i < 0) { console.log('没找到 SPECS = {'); process.exit(1); }
const j = src.indexOf('\n};', i);
if (j < 0) { console.log('没找到 SPECS 结尾'); process.exit(1); }
let block = src.slice(i, j);

let changed = 0;
// 匹配 [n, m] 形式的坐标对（允许空格）
block = block.replace(/\[(\d+)\s*,\s*(\d+)\]/g, (m, r, c) => {
  const nr = parseInt(r, 10) + dr;
  if (nr < 0) { console.log('行号会变成负数:', m); process.exit(1); }
  changed++;
  return '[' + nr + ',' + c + ']';
});

const out = src.slice(0, i) + block + src.slice(j);
fs.writeFileSync(P, out, 'utf8');

// 中文是否完好（防编码事故）
const check = fs.readFileSync(P, 'utf8');
if (check.indexOf('压舱石') < 0 && src.indexOf('压舱石') >= 0) {
  console.log('!! 中文损坏，正在回滚');
  fs.writeFileSync(P, src, 'utf8');
  process.exit(1);
}
console.log('平移了', changed, '个坐标对，delta =', dr, '；中文检查通过');

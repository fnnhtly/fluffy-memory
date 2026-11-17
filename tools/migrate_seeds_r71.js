/* 一次性迁移：把 levels.js 里 1-3 的挑战类型从 powerSpare 换成 seedSpare。
 * 用脚本而不是手改，是因为 levels.js 是一行 40KB 的压缩 JSON。 */
const fs = require('fs');
const p = 'prototype/levels.js';
let s = fs.readFileSync(p, 'utf8');
const before = s;
s = s.split('{"type":"powerSpare","min":1}').join('{"type":"seedSpare"}');
const changed = before !== s;
fs.writeFileSync(p, s, 'utf8');
console.log('changed:', changed);
console.log('powerSpare left:', s.split('powerSpare').length - 1);
console.log('seedSpare:', s.split('seedSpare').length - 1);

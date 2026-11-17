/* 一次性迁移：给 1-3 / 1-6 的 partsBox 补上伞。
 *
 * 为什么需要：这两关都发了风种，但**没有发任何吃风件** ——
 * 玩家触发风场之后什么都不上升，而画面上风场明明在转。
 * 那不是一个"陷阱"，那是一个没有反馈的空按钮。
 * 1-3 的第三星是「一颗种子都不用」，风种本来该是一个真实的诱惑；
 * 要成立，它就必须**真的有用**。
 */
const fs = require('fs');
const p = 'prototype/levels.js';
const src = fs.readFileSync(p, 'utf8');
const levels = JSON.parse(src.slice(src.indexOf('['), src.lastIndexOf(']') + 1));

let changed = 0;
levels.forEach(lv => {
  const box = lv.partsBox || {};
  const hasSeed = box.anemo_core || box.geo_core || box.electro_core;
  const hasCanopy = box.umbrella || box.wind_wing;
  if (hasSeed && !hasCanopy) {
    box.umbrella = 1;
    changed++;
    console.log('  ' + lv.levelId + ' 补上伞');
  }
});
console.log('改了 ' + changed + ' 关');

const out = 'var RAP_LEVELS = ' + JSON.stringify(levels) + ';\n' +
  "if (typeof module !== 'undefined' && module.exports) module.exports = RAP_LEVELS;\n" +
  'else (typeof globalThis !== "undefined" ? globalThis : this).RAP_LEVELS = RAP_LEVELS;\n';
fs.writeFileSync(p, out, 'utf8');

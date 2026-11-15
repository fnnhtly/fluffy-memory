/* 把 levels/*.json 打包成浏览器/Node 都能读的 prototype/levels.js
 *
 * 这个脚本是**关卡数据的唯一出口**，所以 schema 校验放在这里：
 * 任何一份 JSON 出现没登记的字段、或出现"第二份真相"（写在代码里也出现在数据里
 * 的常量），直接失败，不生成 levels.js。
 *
 * 为什么校验放在出口而不是进口：`levels/*.json` 有多个写入者
 * （tools/make_levels.py、tools/gen_level_06.js、tools/tune_1_6_*.js、
 * 以及各种手工 edit），其中好几个**已经过期** —— make_levels.py 生成的 1-2
 * 和现在的 1-2 不是一个东西（后者被手工调过：终点从 col12 挪到 col14、
 * 抬坡从 col8 挪到 col10）。指望每个生产者都守规矩不现实，
 * 但出口只有一个，守在这里就够。
 */
const fs = require('fs');
const path = require('path');
const { validate } = require('./lib/level_schema.js');

const dir = path.join(__dirname, '..', 'levels');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const levels = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));

const problems = validate(levels, (i, lv) => `${files[i]}（${lv.levelId || '?'}）`);
if (problems.length) {
  console.error('关卡数据校验失败，**不生成 levels.js**（旧的 levels.js 保持原样）：');
  problems.forEach(p => console.error('  - ' + p));
  process.exit(1);
}

const out = '/* 自动生成：node tools/build_levels_js.js —— 不要手改，改 levels/*.json */\n' +
  'var RAP_LEVELS = ' + JSON.stringify(levels, null, 0) + ';\n' +
  'if (typeof module !== "undefined" && module.exports) module.exports = RAP_LEVELS;\n';
fs.writeFileSync(path.join(__dirname, '..', 'prototype', 'levels.js'), out, 'utf8');
console.log('levels.js written:', levels.map(l => l.levelId + ' ' + l.name).join(' | '));

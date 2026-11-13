/* 把 levels/*.json 打包成浏览器/Node 都能读的 levels.js */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'levels');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const levels = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const out = '/* 自动生成：node tools/build_levels_js.js */\n' +
  'var RAP_LEVELS = ' + JSON.stringify(levels, null, 0) + ';\n' +
  'if (typeof module !== "undefined" && module.exports) module.exports = RAP_LEVELS;\n';
fs.writeFileSync(path.join(__dirname, '..', 'prototype', 'levels.js'), out, 'utf8');
console.log('levels.js written:', levels.map(l => l.levelId + ' ' + l.name).join(' | '));

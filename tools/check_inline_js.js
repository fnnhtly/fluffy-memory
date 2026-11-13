/* 把 index.html 里的内联脚本抽出来做语法检查（node --check），避免用户双击才看到白屏。
 * 用法：node tools/check_inline_js.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const html = fs.readFileSync(path.join(__dirname, '..', 'prototype', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
console.log('inline script blocks:', scripts.length);
let bad = 0;
scripts.forEach((code, i) => {
  const tmp = path.join(os.tmpdir(), 'inline_' + i + '.js');
  fs.writeFileSync(tmp, code, 'utf8');
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    console.log('  block', i, 'syntax OK (', code.split('\n').length, 'lines )');
  } catch (e) {
    bad++;
    console.log('  block', i, 'SYNTAX ERROR:');
    console.log(String(e.stderr || e.message).split('\n').slice(0, 12).join('\n'));
  }
});
if (bad) { console.log('FAIL'); process.exit(1); }
console.log('all inline scripts OK');

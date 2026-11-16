/* [RED-PROOF] 把 buildOrigin 临时改回第 63 轮的固定屏幕面板，用来证明
 * tools/test_world_anchor.js 真的会变红（不是一条永远为真的空断言）。
 * 用法：node tools/_redproof_anchor.js back|fix
 */
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'prototype', 'index.html');
const GOOD = path.join(require('os').tmpdir(), 'idx-good.html');
const mode = process.argv[2] || 'back';

if (mode === 'fix') {
  fs.copyFileSync(GOOD, P);
  console.log('restored from', GOOD);
  process.exit(0);
}

let h = fs.readFileSync(P, 'utf8');
const startMark = '  function buildOrigin() {';
const endMark = '\n  function worldToScreen';
const i = h.indexOf(startMark);
const j = h.indexOf(endMark, i);
if (i < 0 || j < 0) { console.log('MARKERS NOT FOUND', i, j); process.exit(1); }
const stub = [
  '  function buildOrigin() {',
  '    // [RED-PROOF] 临时改回第 63 轮：固定屏幕面板，与地图无关',
  '    return { x: DW / 2 - RAP.BUILD_COLS * 44 / 2 - 40, y: 222, px: 44 };',
  '  }'
].join('\n');
h = h.slice(0, i) + stub + '\n' + h.slice(j + 1);
fs.writeFileSync(P, h, 'utf8');
console.log('patched buildOrigin -> fixed panel');

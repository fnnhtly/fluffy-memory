/* 反向验证 test_frame_edges.js 与 test_rigid_parts.js：
 * 把 `−a` 改回 `+a`，两条都必须红。
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const P = 'prototype/index.html';
const raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
const orig = crlf ? raw.split('\r\n').join('\n') : raw;
const toDisk = s => (crlf ? s.split('\n').join('\r\n') : s);

const FROM = 'const baseRot = (p.dir || 0) - (car.a * 180 / Math.PI) / 90;';
const TO = 'const baseRot = (p.dir || 0) + (car.a * 180 / Math.PI) / 90;';

function run(file) {
  let out = '';
  try {
    out = execFileSync('node', [file], { encoding: 'utf8', timeout: 600000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗')),
    log: out.split('\n').filter(l => /竖缝|一致率/.test(l))
  };
}

const FILES = ['tools/test_frame_edges.js', 'tools/test_rigid_parts.js'];
let bad = 0;
FILES.forEach(f => {
  const base = run(f);
  console.log(f + ' 基线：' + base.pass + '/' + base.total);
  base.log.forEach(l => console.log('   ' + l.trim()));
  if (!orig.includes(FROM)) { console.log('   SKIP：找不到锚点'); bad++; return; }
  fs.writeFileSync(P, toDisk(orig.split(FROM).join(TO)), 'utf8');
  const r = run(f);
  fs.writeFileSync(P, toDisk(orig), 'utf8');
  const turned = r.pass < base.pass;
  if (!turned) bad++;
  console.log('   ' + (turned ? '把 −a 改回 +a → 变红 ✓' : '把 −a 改回 +a → 仍然全绿 ✗') +
    '  ' + r.pass + '/' + r.total);
  r.fails.forEach(l => console.log('      ' + l));
  r.log.forEach(l => console.log('      ' + l.trim()));
});

fs.writeFileSync(P, toDisk(orig), 'utf8');
console.log(bad ? '\n有反向验证不成立' : '\n两条判据都能失败 —— 它们量的是真东西');
process.exit(bad ? 1 : 0);

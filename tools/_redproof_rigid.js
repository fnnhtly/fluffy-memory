/* 反向验证 test_rigid_parts.js：把 `−a` 改回 `+a`（以及把轮子改回不跟车转），
 * 判据必须红。否则那 95% 的一致率量到的不是"刚体"。
 *
 * ⚠ 锚点用归一化后的 LF 文本（文件是 CRLF），写回去再转回 CRLF ——
 * 第 74 轮踩过这个坑：锚点拼不上会报"找不到"，和"判据不红"完全不是一回事。
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const P = 'prototype/index.html';
const raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
const orig = crlf ? raw.split('\r\n').join('\n') : raw;
const toDisk = s => (crlf ? s.split('\n').join('\r\n') : s);

function run() {
  let out = '';
  try {
    out = execFileSync('node', ['tools/test_rigid_parts.js'],
      { encoding: 'utf8', timeout: 600000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗')),
    lines: out.split('\n').filter(l => /一致率/.test(l))
  };
}

const CASES = [
  {
    name: '把 −a 改回 +a（第 76 轮修掉的那个符号）',
    from: 'const baseRot = (p.dir || 0) - (car.a * 180 / Math.PI) / 90;',
    to: 'const baseRot = (p.dir || 0) + (car.a * 180 / Math.PI) / 90;'
  },
  {
    name: '轮子改回「不跟车身转」（第三种朝向）',
    from: 'const baseRot = (p.dir || 0) - (car.a * 180 / Math.PI) / 90;',
    to: 'const baseRot = p.def.wheel ? 0 : ((p.dir || 0) - (car.a * 180 / Math.PI) / 90);'
  }
];

const base = run();
console.log('基线：' + base.pass + '/' + base.total);
base.lines.forEach(l => console.log('  ' + l.trim()));

let bad = 0;
CASES.forEach(c => {
  if (!orig.includes(c.from)) {
    console.log('  SKIP ' + c.name + '：找不到锚点');
    bad++;
    return;
  }
  fs.writeFileSync(P, toDisk(orig.split(c.from).join(c.to)), 'utf8');
  const r = run();
  fs.writeFileSync(P, toDisk(orig), 'utf8');
  const turned = r.pass < base.pass;
  if (!turned) bad++;
  console.log('  ' + (turned ? '变红 ✓' : '仍然全绿 ✗') + '  ' + c.name +
    '  → ' + r.pass + '/' + r.total);
  r.fails.forEach(l => console.log('      ' + l));
});

fs.writeFileSync(P, toDisk(orig), 'utf8');
console.log(bad ? '有反向验证不成立' : '全部反向验证通过：每拆掉一处，判据都会红');
process.exit(bad ? 1 : 0);

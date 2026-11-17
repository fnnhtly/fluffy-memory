/* 反向验证 test_1_8_structure.js 与 test_difficulty_curve.js（第 84 轮）。
 *
 * 这一轮修的是**量具**（randomBuild 的格子冲突），所以反向验证要
 * 把那个 bug 放回去，看判据会不会红。
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const P = 'tools/lib/random_build.js';
const orig = fs.readFileSync(P, 'utf8');

function run(file) {
  let out = '';
  try {
    out = execFileSync('node', [file], { encoding: 'utf8', timeout: 900000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗')),
    log: out.split('\n').filter(l => /三件套|八关通关率/.test(l))
  };
}

/* 把 takeCell 改成"永远返回同一个格"= 复现格子冲突 */
const CLASH = `  function takeCell(row) {
    const free = [];
    for (let c = 1; c <= nFrame; c++) if (!used[row].has(c)) free.push(c);
    if (!free.length) return null;
    const c = free[rnd(free.length)];
    used[row].add(c);
    return [row, c];
  }`;
const CLASH_BROKEN = `  function takeCell(row) {
    return [row, 1];
  }`;

const TESTS = ['tools/test_difficulty_curve.js', 'tools/test_1_8_structure.js'];

let bad = 0;
TESTS.forEach(f => {
  const base = run(f);
  console.log(f + ' 基线：' + base.pass + '/' + base.total);
  base.log.forEach(l => console.log('   ' + l.trim()));
  if (!orig.includes(CLASH)) { console.log('   SKIP：找不到 takeCell'); bad++; return; }
  fs.writeFileSync(P, orig.split(CLASH).join(CLASH_BROKEN), 'utf8');
  const r = run(f);
  fs.writeFileSync(P, orig, 'utf8');
  const turned = r.pass < base.pass;
  if (!turned) bad++;
  console.log('   把格子冲突放回去 → ' + (turned ? '变红 ✓' : '仍然全绿 ✗') +
    '  ' + r.pass + '/' + r.total);
  r.log.forEach(l => console.log('      ' + l.trim()));
  r.fails.slice(0, 3).forEach(l => console.log('      ' + l));
});
fs.writeFileSync(P, orig, 'utf8');
console.log(bad ? '\n有反向验证不成立' : '\n判据能失败 —— 它们量的是真东西');
process.exit(bad ? 1 : 0);

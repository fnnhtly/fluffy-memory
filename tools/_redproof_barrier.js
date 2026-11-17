/* 反向验证 test_barrier.js（第 83 轮）。
 *
 * 两条真 bug 各自都能被拆回去：
 *   ① 鼻子用 car.x + hull.maxX（负 maxX 的车整批穿墙）
 *   ② fromLeft 用 car.x（车会一帧瞬移 2 米穿过去）
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const P = 'prototype/game.js';
const raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
const orig = crlf ? raw.split('\r\n').join('\n') : raw;
const toDisk = s => (crlf ? s.split('\n').join('\r\n') : s);

function run() {
  let out = '';
  try {
    out = execFileSync('node', ['tools/test_barrier.js'], { encoding: 'utf8', timeout: 600000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗'))
  };
}

const CASES = [
  {
    name: '① 鼻子改回 car.x + hull.maxX（负 maxX 的车穿墙）',
    from: 'var hullMin = Math.min(car.hull.minX, car.hull.maxX);',
    to: 'var hullMin = -car.hull.maxX;'
  },
  {
    name: '② fromLeft 改回 car.x',
    from: 'var fromLeft = hullC < br.col + 0.5;',
    to: 'var fromLeft = car.x < br.col + 0.5;'
  }
];

const base = run();
console.log('基线：' + base.pass + '/' + base.total);
if (base.pass !== base.total) base.fails.forEach(l => console.log('  ' + l));

let bad = 0;
CASES.forEach(c => {
  if (!orig.includes(c.from)) { console.log('  SKIP ' + c.name + '：找不到锚点'); bad++; return; }
  fs.writeFileSync(P, toDisk(orig.split(c.from).join(c.to)), 'utf8');
  const r = run();
  fs.writeFileSync(P, toDisk(orig), 'utf8');
  const turned = r.pass < base.pass;
  if (!turned) bad++;
  console.log('  ' + (turned ? '变红 ✓' : '仍然全绿 ✗') + '  ' + c.name +
    '  → ' + r.pass + '/' + r.total);
  r.fails.slice(0, 3).forEach(l => console.log('      ' + l));
});
fs.writeFileSync(P, toDisk(orig), 'utf8');
console.log(bad ? '\n有反向验证不成立' : '\n两条修复都能被拆回去 —— 判据量的是真东西');
process.exit(bad ? 1 : 0);

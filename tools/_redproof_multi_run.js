/* 反向验证 test_multi_run.js（第 93 轮）。
 *
 * 拆掉 launch() 里"表现层字段清零"那一段，B / C 必须红。
 * 逐条拆，确认每条判据都各自有能力失败。
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
    out = execFileSync('node', ['tools/test_multi_run.js'],
      { encoding: 'utf8', timeout: 900000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗'))
  };
}

const CASES = [
  { name: '不清峰值（shakePeak / flashPeak）',
    from: '    state.shakePeak = 0;\n    state.flashPeak = 0;\n', to: '' },
  { name: '不清粒子数组', 
    from: '    state.dust = [];\n    state.debris = [];\n    state.bursts = [];\n' +
          '    state.confetti = [];\n    state.boxBurst = [];\n',
    to: '' }
];

const base = run();
console.log('基线：' + base.pass + '/' + base.total);
if (base.pass !== base.total) base.fails.forEach(l => console.log('  ' + l));

let bad = 0;
for (const c of CASES) {
  if (!orig.includes(c.from)) { console.log('  SKIP ' + c.name + '：找不到锚点'); bad++; continue; }
  fs.writeFileSync(P, toDisk(orig.split(c.from).join(c.to)), 'utf8');
  const r = run();
  fs.writeFileSync(P, toDisk(orig), 'utf8');
  const turned = r.pass < base.pass;
  if (!turned) bad++;
  console.log('  ' + (turned ? '变红 ✓' : '仍然全绿 ✗') + '  ' + c.name +
    '  → ' + r.pass + '/' + r.total);
  r.fails.slice(0, 2).forEach(l => console.log('      ' + l));
}
fs.writeFileSync(P, toDisk(orig), 'utf8');
console.log(bad ? '\n有反向验证不成立' : '\n两条判据都能失败 —— 它们量的是真东西');
process.exit(bad ? 1 : 0);

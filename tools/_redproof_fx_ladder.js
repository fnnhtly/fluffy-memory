/* 反向验证 test_fx_ladder.js（第 92 轮）。
 *
 * 判据守的是"事件 → 反馈强度"的档位关系。要拆的：
 *   · 把 lvl3/lvl4 的闪帧删掉 → E 必须红
 *   · 把 lvl2~4 的暗角删掉     → F 必须红
 *   · 把分级强度数组压平       → B/D 必须红
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
    out = execFileSync('node', ['tools/test_fx_ladder.js'],
      { encoding: 'utf8', timeout: 900000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗'))
  };
}

const CASES = [
  {
    name: '删掉 lvl3+ 的闪帧',
    from: 'if (lv >= 3) { state.flash = Math.max(state.flash, 0.35); }',
    to: 'if (false) { state.flash = Math.max(state.flash, 0.35); }'
  },
  {
    name: '删掉 lvl2+ 的暗角',
    from: 'if (lv >= 2) { state.vignette = Math.max(state.vignette, lv >= 3 ? 0.7 : 0.25); }',
    to: 'if (false) { state.vignette = Math.max(state.vignette, 0); }'
  },
  {
    name: '分级强度数组压平（四档全 0.3）',
    from: 'const strengths = [0, 0.10, 0.22, 0.42, 0.85];',
    to: 'const strengths = [0, 0.30, 0.30, 0.30, 0.30];'
  }
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
  r.fails.slice(0, 3).forEach(l => console.log('      ' + l));
}
fs.writeFileSync(P, toDisk(orig), 'utf8');
console.log(bad ? '\n有反向验证不成立' : '\n三条判据都能失败 —— 它们量的是真东西');
process.exit(bad ? 1 : 0);

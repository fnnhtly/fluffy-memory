/* 反向验证 test_feedback.js（第 91 轮）。
 *
 * 两条判据都是"事件后差异 − 噪声 ≥ 1 个百分点"。
 * 要拆的是**演出代码本身**：
 *   · 把 boxBurst / boxPop / boxPulse 三行全删 → A 必须红
 *   · 把猪的 mood = 'hurt' 那行删掉 → B 必须红
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
    out = execFileSync('node', ['tools/test_feedback.js'],
      { encoding: 'utf8', timeout: 900000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗')),
    log: out.split('\n').filter(l => /噪声/.test(l))
  };
}

const CASES = [
  {
    name: '删掉捡木箱的三层演出（boxBurst / boxPop / boxPulse）',
    from: 'state.boxPulse = 1;',
    to: 'state.boxPulse = 0;'
  },
  {
    name: '删掉猪的受伤表情（mood = hurt）',
    from: "else if (state.run.pigHP < 3) mood = 'hurt';",
    to: 'else if (false) mood = \'hurt\';'
  }
];

const base = run();
console.log('基线：' + base.pass + '/' + base.total);
base.log.forEach(l => console.log('  ' + l.trim()));
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
  r.log.forEach(l => console.log('      ' + l.trim()));
  r.fails.slice(0, 2).forEach(l => console.log('      ' + l));
}
fs.writeFileSync(P, toDisk(orig), 'utf8');
console.log(bad ? '\n有反向验证不成立' : '\n两条判据都能失败 —— 它们量的是真东西');
process.exit(bad ? 1 : 0);

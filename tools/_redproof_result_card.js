/* 反向验证 test_result_card_fit.js（第 94 轮）。 */
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
    out = execFileSync('node', ['tools/test_result_card_fit.js'],
      { encoding: 'utf8', timeout: 300000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗'))
  };
}

const CASES = [
  { name: '把累计星数那行改回 cardY+428（旧值，越出卡底 4px）',
    from: 'X + W / 2, cardY + 410, 13,', to: 'X + W / 2, cardY + 428, 13,' },
  { name: '把用时那一行推到 cardY+440（越出 16px）',
    from: "text(`用时 ${st.time.toFixed(2)} s`, X + 42, cardY + 388, 16, '#cfe0ec', 'left');",
    to: "text(`用时 ${st.time.toFixed(2)} s`, X + 42, cardY + 440, 16, '#cfe0ec', 'left');" }
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

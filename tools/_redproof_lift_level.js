/* 反向验证 test_lift_level.js（第 81 轮）。
 *
 * 这一组判据全围绕"1-6 有没有决策"，所以要拆的是**决策本身**。
 * 修过两次锚点：
 *   1. `case 'allSandbags':` 后面还有两行真正的判定，不能只插 return；
 *      要整段替换成 `return true;`
 *   2. 第二个占位用例（沙袋质量改 0）的 from === to，没有意义 —— 删掉。
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const P = 'prototype/game.js';
const raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
const orig = crlf ? raw.split('\r\n').join('\n') : raw;
const toDisk = s => (crlf ? s.split('\n').join('\r\n') : s);

function run(file) {
  let out = '';
  try {
    out = execFileSync('node', [file], { encoding: 'utf8', timeout: 600000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗'))
  };
}

const FROM = `case 'allSandbags':
        return (state.sandbagTotal || 0) > 0 &&
               (state.sandbagsDropped || 0) >= state.sandbagTotal;`;
const TO = `case 'allSandbags':
        return true;`;

const TESTS = ['tools/test_lift_level.js', 'tools/test_lift_predictable.js'];

let bad = 0;
TESTS.forEach(f => {
  const base = run(f);
  console.log(f + ' 基线：' + base.pass + '/' + base.total);
  if (base.pass !== base.total) base.fails.forEach(l => console.log('  ' + l));
  if (!orig.includes(FROM)) { console.log('  SKIP：找不到 allSandbags 锚点'); bad++; return; }
  fs.writeFileSync(P, toDisk(orig.split(FROM).join(TO)), 'utf8');
  const r = run(f);
  fs.writeFileSync(P, toDisk(orig), 'utf8');
  const turned = r.pass < base.pass;
  if (!turned) bad++;
  console.log('  ' + (turned ? '拆掉「沙袋全扔」判定 → 变红 ✓' : '→ 仍然全绿 ✗') +
    '  ' + r.pass + '/' + r.total);
  r.fails.slice(0, 5).forEach(l => console.log('      ' + l));
});
fs.writeFileSync(P, toDisk(orig), 'utf8');
console.log(bad ? '\n有反向验证不成立' : '\n判据能失败 —— 它们量的是真东西');
process.exit(bad ? 1 : 0);

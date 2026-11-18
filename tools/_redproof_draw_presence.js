/* 反向验证 test_draw_presence.js（第 89 轮）。
 *
 * 判据是"隐藏前后在目标矩形内的差异 ≥ 2%"。要拆的是**绘制本身**：
 * 把三个 drawXxx 整个早退掉，三条判据都必须红。
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
    out = execFileSync('node', ['tools/test_draw_presence.js'],
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
    name: 'drawTray 无条件早退',
    from: "if (!state.__hideDraw || state.__hideDraw !== 'drawTray') drawTray();",
    to: 'if (false) drawTray();'
  },
  {
    name: 'drawHintBtn 无条件早退',
    from: "if (!state.__hideDraw || state.__hideDraw !== 'drawHintBtn') drawHintBtn();",
    to: 'if (false) drawHintBtn();'
  },
  {
    name: 'drawHintCard 无条件早退',
    from: "if (!state.__hideDraw || state.__hideDraw !== 'drawHintCard') drawHintCard();",
    to: 'if (false) drawHintCard();'
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
  r.fails.slice(0, 2).forEach(l => console.log('      ' + l));
});
fs.writeFileSync(P, toDisk(orig), 'utf8');
console.log(bad ? '\n有反向验证不成立' : '\n三条判据都能失败 —— 它们量的是真东西');
process.exit(bad ? 1 : 0);

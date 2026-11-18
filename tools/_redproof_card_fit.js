/* 反向验证 test_card_fit.js（第 95 轮）。
 *
 * 判据守的是"文字不越出自己所属的卡片"。要拆的是**坐标**：
 * 把每张卡里最低的那行推出去，对应的判据必须红。
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
    out = execFileSync('node', ['tools/test_card_fit.js'],
      { encoding: 'utf8', timeout: 300000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗'))
  };
}

const CASES = [
  { name: '结算卡：累计星数推回 cardY+428（越界 4px）',
    from: 'X + W / 2, cardY + 410, 13,', to: 'X + W / 2, cardY + 428, 13,' },
  { name: '暂停卡：第一行文字推到 P.y+240（卡底 468 → 482）',
    from: "text(state.autoPaused ? '窗口切走了，已经替你暂停' : '时间已停住，可以慢慢想',\n        DW / 2, P.y + 78,",
    to: "text(state.autoPaused ? '窗口切走了，已经替你暂停' : '时间已停住，可以慢慢想',\n        DW / 2, P.y + 240," },
  { name: '选关卡：加一行 y+260 的文字（卡高 250）',
    from: "text(got + ' / ' + tot + ' 星', BX + BW / 2, BY + 52, 13,",
    to: "text('越界测试', x + CW / 2, y + 260, 13, '#fff', 'center');\n    text(got + ' / ' + tot + ' 星', BX + BW / 2, BY + 52, 13," }
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
console.log(bad ? '\n有反向验证不成立' : '\n三条判据都能失败 —— 它们量的是真东西');
process.exit(bad ? 1 : 0);

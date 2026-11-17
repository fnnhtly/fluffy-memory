/* 反向验证：把"种子按钮"的绘制和热区分别拆掉，看 test_seed_button 会不会红。
 * 用脚本文件而不是 node -e —— 中文和引号在 PowerShell 一层会被吃掉。 */
const fs = require('fs');
const { execFileSync } = require('child_process');

/* ⚠ 文件是 CRLF（Windows + git autocrlf）。
 * 锚点必须先归一化再匹配 —— 第一版直接用 `\n` 拼锚点，
 * 三个用例里有两个报"找不到"，而那不是判据坏了，是锚点没对上。
 * 这也提醒：**反向验证脚本自己也要能失败得清楚**。 */
const P = 'prototype/index.html';
const origRaw = fs.readFileSync(P, 'utf8');
const usesCRLF = origRaw.includes('\r\n');
const orig = usesCRLF ? origRaw.split('\r\n').join('\n') : origRaw;
const toDisk = s => usesCRLF ? s.split('\n').join('\r\n') : s;

function run() {
  try {
    const out = execFileSync('node', ['tools/test_seed_button.js'],
      { encoding: 'utf8', timeout: 300000 });
    const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
    const fails = out.split('\n').filter(l => l.startsWith('✗'));
    return { pass: m ? +m[1] : -1, total: m ? +m[2] : -1, fails };
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
    const fails = out.split('\n').filter(l => l.startsWith('✗'));
    return { pass: m ? +m[1] : -1, total: m ? +m[2] : -1, fails };
  }
}

/* 每一个 RED-PROOF 都是"删掉一段它该保护的代码"。 */
const cases = [
  {
    name: '把按钮热区去掉（btnRect("seed") 恒 null）',
    apply: s => {
      const a = "      if (name === 'seed') {";
      if (!s.includes(a)) throw new Error('找不到 btnRect("seed")');
      return s.replace(a, a + '\n        return null;');
    }
  },
  {
    name: '把绘制去掉（按钮区域什么都不画）',
    apply: s => {
      /* 用单行锚点，避开多行拼接的缩进差异。 */
      const a = "        if (sb) {\n          const info = seedInfoOf(state.run);";
      if (!s.includes(a)) throw new Error('找不到种子按钮绘制块（锚点：if (sb) + seedInfoOf）');
      return s.replace(a, "        if (sb) {\n          const info = { left: 0, next: null };\n        }\n        if (false) {\n          const info = seedInfoOf(state.run);");
    }
  },
  {
    name: '把点击分派去掉（热区在但点不动）',
    apply: s => {
      const a = "      const sbR = btnRect('seed');\n      if (sbR && hit(sbR, p.x, p.y)) {";
      if (!s.includes(a)) throw new Error('找不到种子点击分派');
      return s.replace(a, "      const sbR = null;\n      if (sbR && hit(sbR, p.x, p.y)) {");
    }
  }
];

const base = run();
console.log('基线：' + base.pass + '/' + base.total + (base.fails.length ? '  ' + base.fails.join(' | ') : ''));

let allRed = true;
cases.forEach(c => {
  let mod;
  try { mod = c.apply(orig); } catch (e) { console.log('  SKIP ' + c.name + '：' + e.message); return; }
  fs.writeFileSync(P, toDisk(mod), 'utf8');
  const r = run();
  fs.writeFileSync(P, toDisk(orig), 'utf8');
  const turned = r.pass < base.pass;
  if (!turned) allRed = false;
  console.log('  ' + (turned ? '变红 ✓' : '仍然全绿 ✗') + '  ' + c.name +
    '  → ' + r.pass + '/' + r.total +
    (r.fails.length ? '\n      ' + r.fails.join('\n      ') : ''));
});
fs.writeFileSync(P, toDisk(orig), 'utf8');
console.log(allRed ? '全部反向验证通过：每拆掉一处，判据都会红' :
  '有反向验证不成立 —— 那条判据量的不是它声称的东西');
process.exit(allRed ? 0 : 1);

/* 重写 _redproof_watchdog.js（第 82 轮，第二版）。
 *
 * ── 上一版的两个问题 ──
 *
 *  1. `progressGain 2 → 60` **不会红**，而且这是**真结论**：
 *     没有任何一局获胜的车能凑满一个窗口，所以"不触发"是数学必然，
 *     与 gain 无关。这一条要标 informational 并写清原因。
 *  2. `progressWindow: 8.0,` 锚点过期（现在是 10.0）。
 *
 * ── 真正能拆的是什么 ──
 *
 *   · 把 progressWindow 压到 0.5 → 窗口太短，每局都会凑满，
 *     于是标准解被误判（A 组红）。
 *   · 把 trace 关掉 → E 组红。
 *   · 把 progressWindow 压到 6（短于最长标准解 7.02）→ A 组也红，
 *     而且这是**结构性**的红。
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
    out = execFileSync('node', [file], { encoding: 'utf8', timeout: 900000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗'))
  };
}

const CASES = [
  {
    name: 'progressWindow 10 → 6（短于最长标准解 7.02 秒）',
    file: 'tools/test_watchdog_structural.js',
    from: '    progressWindow: 10.0,', to: '    progressWindow: 6.0,'
  },
  {
    name: 'progressWindow 10 → 0.5（窗口太短，每局都凑满）',
    file: 'tools/test_watchdog_health.js',
    from: '    progressWindow: 10.0,', to: '    progressWindow: 0.5,'
  },
  {
    name: 'trace 不录（基础设施坏掉）',
    file: 'tools/test_watchdog_health.js',
    from: 'if (trace && state.car) {', to: 'if (false) {'
  },
  {
    /* ⚠ 记录项：这一条**必然不红**，而且那是真结论。
     * 没有任何一局获胜的车能凑满窗口（最长标准解 7.02 秒 < W=10），
     * 所以"标准解 0 触发"与 gain 无关 —— 它量的是窗口，不是门槛。
     * 保留为记录，不进通过判定。 */
    name: '（记录项）progressGain 2 → 60 —— 与"0 触发"无关，必然不红',
    file: 'tools/test_watchdog_structural.js',
    from: '    progressGain: 2.0,', to: '    progressGain: 60.0,',
    informational: true
  }
];

let bad = 0;
CASES.forEach(c => {
  const base = run(c.file);
  if (!orig.includes(c.from)) { console.log('  SKIP ' + c.name + '：找不到锚点'); bad++; return; }
  fs.writeFileSync(P, toDisk(orig.split(c.from).join(c.to)), 'utf8');
  const r = run(c.file);
  fs.writeFileSync(P, toDisk(orig), 'utf8');
  const turned = r.pass < base.pass;
  if (!turned && !c.informational) bad++;
  console.log('  ' + (turned ? '变红 ✓' : '仍然全绿' + (c.informational ? '（记录项，符合预期）' : ' ✗')) +
    '  ' + c.name + '  → ' + r.pass + '/' + r.total);
  r.fails.slice(0, 3).forEach(l => console.log('      ' + l));
});
fs.writeFileSync(P, toDisk(orig), 'utf8');
console.log(bad ? '\n有反向验证不成立' : '\n判据能失败 —— 它们量的是真东西');
process.exit(bad ? 1 : 0);

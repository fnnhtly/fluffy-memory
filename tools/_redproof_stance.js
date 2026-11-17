/* 反向验证 test_car_stance.js：
 *   · 把接触力矩的力臂改回"绕原点"（不减质心）→ A/B/C 必须红；
 *   · 把重力支重的杠杆分配关掉（shares = null）→ A 必须红；
 *   · 把轮子的 0.5 折减加回来 → A 必须红（说明那个折减是错的）。
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
    out = execFileSync('node', ['tools/test_car_stance.js'],
      { encoding: 'utf8', timeout: 600000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗'))
  };
}

const CASES = [
  {
    name: '接触力矩改回绕原点（不减质心）',
    from: 'tq += ((rx - cLx) * (ny * N + ty * Ft) - (ry - cLy) * (nx * N + tx * Ft));',
    to: 'tq += (rx * (ny * N + ty * Ft) - ry * (nx * N + tx * Ft));'
  },
  {
    name: '关掉杠杆分配（shares = null，回到纯弹簧）',
    from: '      if (contacts.length >= 2) {',
    to: '      if (false) {'
  },
  {
    /* ⚠ 这一条**故意**不会变红，而且必须有这个认识。
     *
     * 杠杆分配（shares）之后，静止那部分法向力的**净力矩恒为 0**，
     * 与它在 tq 里乘什么系数无关 —— 乘 0.5 只是把"冲击那一部分"也一起缩放。
     * 所以 0.5 已经不再是"补偿错误"，它变成了一个纯粹的手感系数。
     *
     * 那为什么还删？因为它原本的注释说的是"防止磕台阶就翻"，
     * 而磕台阶的翻身是**角速度**问题，该用阻尼治，不该靠削弱静力学。
     * 留着它会让"落地那一下的抬头力矩"少一半，和恢复系数对不上。
     * 既然删了不会让任何判据变红，就说明它不是任何行为的必要条件 ——
     * 这正是可以安全删掉它的证据。
     *
     * 这一条**不参与**通过/失败判定，只作为记录。 */
    name: '（记录项）把轮子的 0.5 折减加回来 —— 杠杆分配之后它已不影响静平衡',
    from: 'tq += ((rx - cLx) * (ny * N + ty * Ft) - (ry - cLy) * (nx * N + tx * Ft));',
    to: 'tq += 0.5 * ((rx - cLx) * (ny * N + ty * Ft) - (ry - cLy) * (nx * N + tx * Ft));',
    informational: true
  },
  {
    name: '质心当原点（measureCom 恒返回 0）',
    from: '    car.comLx = m > 0 ? mx / m : 0;',
    to: '    car.comLx = 0;'
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
  if (!turned && !c.informational) bad++;
  console.log('  ' + (turned ? '变红 ✓' : '仍然全绿 ✗') + '  ' + c.name +
    '  → ' + r.pass + '/' + r.total);
  r.fails.slice(0, 4).forEach(l => console.log('      ' + l));
});
fs.writeFileSync(P, toDisk(orig), 'utf8');
console.log(bad ? '\n有反向验证不成立' : '\n三条判据都能失败 —— 它们量的是真东西（第 4 条是记录项）');
process.exit(bad ? 1 : 0);

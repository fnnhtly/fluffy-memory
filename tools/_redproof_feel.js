/* 反向验证 test_feel.js：六条基线里每一条拆掉之后，判据必须红。
 *
 * 这一轮的判据都是**性能/手感基线**，不是功能正确性 ——
 * 所以它们最容易变成"永远不会红的装饰"。必须逐条证明它们能失败。
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
    out = execFileSync('node', ['tools/test_feel.js'], { encoding: 'utf8', timeout: 600000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗'))
  };
}

/* 每条用例都通过**改参数**或**改公式**来拆掉一个手感维度。 */
const CASES = [
  {
    name: 'A 起步（把重力砍到 1/4 → 下坡推不动）',
    from: 'gravity: 16.0,',
    to: 'gravity: 4.0,'
  },
  {
    name: 'B 极速（把 maxSpeed 抬到 40 → 极速跟不上上限，判据红）',
    from: 'maxSpeed: 12.0,',
    to: 'maxSpeed: 40.0,'
  },
  {
    /* C 组量"自由落体后的回弹"，要拆的是**接触刚度**。
     * ⚠ 这一条和下面的 D 组用的是同一个锚点 —— 都会让多条判据红，
     * 那没关系：反向验证只要求"至少有一条红"。 */
    name: 'C 落地回弹（把接触刚度 320 砍到 20）',
    from: 'Math.min(320 * pen - 50 * vn, 2.5 * car.mass * G)',
    to: 'Math.min(8 * pen - 0.2 * vn, 2.5 * car.mass * G)'
  },
  {
    name: 'D 落地（把接触刚度 320 砍到 20 → 落地会陷进去再弹起来）',
    from: 'Math.min(320 * pen - 50 * vn, 2.5 * car.mass * G)',
    to: 'Math.min(20 * pen - 0.5 * vn, 2.5 * car.mass * G)'
  },
  {
    name: 'E1 坡上加速（把重力砍半 → 加速度对不上理论）',
    from: 'gravity: 16.0,',
    to: 'gravity: 8.0,'
  },
  {
    /* ⚠ **这一条必然不会红，而且那是真结论。**
     *
     * E2 只保护行为（低速残余会停），不绑定实现 —— 因为实测证明
     * 平地上**滚动阻力**（0.14×16 = 2.24 m/s²）单独就能停住一切
     * 4 秒内滑动 < 9 m/s 的车，而蠕行刹车的窗口是 spNow < 1.5，
     * 完全被包含。关掉 creepBrake 对行为没有可观测影响。
     *
     * 四次尝试都量不出差别（切向 0.5 / 切向 0.12 / 竖直 0.12 / 差分 0.2）。
     * 保留这一条作为**记录**，不是通过条件。 */
    name: '（记录项）关掉蠕行刹车 —— 平地上它被滚动阻力覆盖，必然不红',
    from: 'if (!driving && !onSlope && spNow < 1.5) {',
    to: 'if (false) {',
    informational: true
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
  r.fails.slice(0, 3).forEach(l => console.log('      ' + l));
});
fs.writeFileSync(P, toDisk(orig), 'utf8');
console.log(bad ? '\n有反向验证不成立' : '\n手感基线都能失败（E2 那条是记录项，见文件内说明）');
process.exit(bad ? 1 : 0);

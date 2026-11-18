/* 批量反向验证器（第 88 轮）。
 *
 * ── 为什么需要它 ──
 *
 * 第 80~87 轮里抓到**五条空转判据**（第 80 轮三条、第 82 轮看门狗、
 * 第 87 轮 HUD）。这不是偶发，而是判据的**默认失败模式**：
 * 写的时候它当然通过，没有人去证明"拆掉被测代码它会红"。
 *
 * 项目里已经有 12 份手写反向验证（`_redproof_*.js`），
 * 覆盖 113 个测试脚本的约 11%。剩下的呢？
 *
 * ── 这个脚本做什么 ──
 *
 * 对**纯 Node 测试**做批量变异：
 *   1. 对一组已知的数值参数（gravity / maxSpeed / damageMin / …）逐个施加
 *      极端变异（×0.25 或 ×4，视方向）
 *   2. 每次变异后跑**全部**纯 Node 测试，记下哪些测试变红
 *   3. 汇总成一张"哪个参数被哪条测试守着"的表
 *
 * 一个参数被改动后**没有任何测试变红**，说明那个参数没人守 ——
 * 那是比"某条判据空转"更根本的问题。
 *
 * ── 为什么只跑纯 Node 测试 ──
 *
 * 浏览器测试每次 5~15 秒，变异一次跑 74 个要把一轮变成几小时。
 * 纯 Node 的 33 个加起来约 20 秒，可以承受几十轮变异。
 * 浏览器测试的那一半由手写 `_redproof_*.js` 覆盖。
 *
 * 用法：
 *   node tools/mutation_sweep.js            # 完整扫描
 *   node tools/mutation_sweep.js --dry      # 只列出变异清单
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'prototype', 'game.js');
const LEVELS = path.join(ROOT, 'prototype', 'levels.js');

/* 只跑纯 Node 的（不开浏览器）。列表从 verify.mjs 读，再按源码筛。 */
function pureNodeTests() {
  const s = fs.readFileSync(path.join(ROOT, 'tools', 'verify.mjs'), 'utf8');
  const names = [...s.matchAll(/'([a-z0-9_]+\.js)'/g)].map(x => x[1]);
  return names.filter(n => {
    const p = path.join(ROOT, 'tools', n);
    if (!fs.existsSync(p)) return false;
    const code = fs.readFileSync(p, 'utf8');
    return !/spawn\(|msedge|remote-debugging/.test(code);
  });
}

/* 变异清单：{ 文件, 原文, 替换, 名称 }
 * 每条都是"把某个真参数推到极端"。**不写占位用例** —— 那些跑起来不会红。 */
const MUTATIONS = [
  { f: 'game', name: 'gravity ×0.25', from: 'gravity: 16.0,', to: 'gravity: 4.0,' },
  { f: 'game', name: 'gravity ×2', from: 'gravity: 16.0,', to: 'gravity: 32.0,' },
  { f: 'game', name: 'maxSpeed ×0.4', from: 'maxSpeed: 12.0,', to: 'maxSpeed: 4.8,' },
  { f: 'game', name: 'damageMin → 0.5', from: 'damageMin: 4.5,', to: 'damageMin: 0.5,' },
  { f: 'game', name: 'damageMin → 40', from: 'damageMin: 4.5,', to: 'damageMin: 40.0,' },
  { f: 'game', name: 'progressWindow → 0.5', from: 'progressWindow: 10.0,', to: 'progressWindow: 0.5,' },
  { f: 'game', name: 'progressWindow → 40', from: 'progressWindow: 10.0,', to: 'progressWindow: 40.0,' },
  { f: 'game', name: 'liftMaxRise → 0.2', from: 'liftMaxRise: 2.5,', to: 'liftMaxRise: 0.2,' },
  { f: 'game', name: 'liftMaxRise → 12', from: 'liftMaxRise: 2.5,', to: 'liftMaxRise: 12.0,' },
  { f: 'game', name: 'creepBrake → 0', from: 'creepBrake: 2.5,', to: 'creepBrake: 0.0,' },
  { f: 'game', name: 'goalMaxAlt → 0.1', from: 'goalMaxAlt: 2.2,', to: 'goalMaxAlt: 0.1,' },
  { f: 'game', name: 'windRise → 0', from: 'windRise: 3.0,', to: 'windRise: 0.0,' },
  { f: 'game', name: 'dashAccel → 0', from: 'dashAccel: 16.0,', to: 'dashAccel: 0.0,' },
  { f: 'game', name: 'pillarRise → 0', from: 'pillarRise: 0.35,', to: 'pillarRise: 0.0,' },
  { f: 'game', name: 'touchLvl2 → 99', from: 'touchLvl2: 1.35,', to: 'touchLvl2: 99.0,' },
  { f: 'game', name: 'touchLvl3 → 99', from: 'touchLvl3: 4.5,', to: 'touchLvl3: 99.0,' },
  { f: 'game', name: '木框 maxHp 3 → 99', from: 'maxHp: 3', to: 'maxHp: 99' },
  /* ⚠ 沙袋的锚点必须带上它自己那一行 —— `sandbag: { label: '压舱石', stack: true,
   * maxStack: 3, mass: 0.8,` 是跨行的（第一版写 `sandbag: { mass: 0.8` 找不到）。 */
  { f: 'game', name: '沙袋质量 0.8 → 0', from: 'maxStack: 3, mass: 0.8,', to: 'maxStack: 3, mass: 0.0,' },
  { f: 'game', name: '气球浮力 3.2 → 0.2', from: 'liftMass: 3.2', to: 'liftMass: 0.2' }
];
const MUT = MUTATIONS;

function runTest(name) {
  try {
    const out = execFileSync(process.execPath,
      [path.join('tools', name)],
      { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
    return { ok: !m || m[1] === m[2], pass: m ? +m[1] : -1, total: m ? +m[2] : -1 };
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
    return { ok: false, pass: m ? +m[1] : -1, total: m ? +m[2] : -1 };
  }
}

const tests = pureNodeTests();
console.log('纯 Node 测试 ' + tests.length + ' 个；变异 ' + MUT.length + ' 条');
if (process.argv.includes('--dry')) {
  MUT.forEach(m => console.log('  ' + m.f + '  ' + m.name));
  process.exit(0);
}

/* 基线：所有测试都得绿，否则下面的红分不清是谁造成的 */
const base = {};
tests.forEach(n => { base[n] = runTest(n); });
const baseBad = tests.filter(n => !base[n].ok);
if (baseBad.length) {
  console.log('⚠ 基线有 ' + baseBad.length + ' 个测试不绿，先修它们：' +
    baseBad.join(' '));
  process.exit(1);
}
console.log('基线：' + tests.length + ' 个全绿');

const backup = {
  game: fs.readFileSync(GAME, 'utf8'),
  levels: fs.readFileSync(LEVELS, 'utf8')
};
const crlf = backup.game.includes('\r\n');
const toDisk = (s) => (crlf ? s.split('\n').join('\r\n') : s);

const report = [];
for (const m of MUT) {
  const p = m.f === 'game' ? GAME : LEVELS;
  const orig = backup[m.f];
  if (!orig.includes(m.from)) {
    report.push({ name: m.name, anchors: 0, killers: [] });
    console.log('  SKIP ' + m.name + '（找不到锚点）');
    continue;
  }
  const mutated = m.f === 'game' ? toDisk(orig.split(m.from).join(m.to))
    : orig.split(m.from).join(m.to);
  fs.writeFileSync(p, mutated, 'utf8');

  const killers = [];
  for (const n of tests) {
    const r = runTest(n);
    if (!r.ok) killers.push(n);
  }
  fs.writeFileSync(p, orig, 'utf8');
  report.push({ name: m.name, anchors: 1, killers });
  console.log('  ' + (killers.length ? '✓' : '✗') + ' ' + m.name.padEnd(22) +
    (killers.length ? killers.length + ' 条变红：' + killers.slice(0, 4).join(', ') +
      (killers.length > 4 ? ' …' : '') : '**没有任何测试变红**'));
}

fs.writeFileSync(GAME, backup.game, 'utf8');
fs.writeFileSync(LEVELS, backup.levels, 'utf8');

const unguarded = report.filter(r => r.anchors && r.killers.length === 0);
console.log('');
console.log('=== 汇总 ===');
console.log('变异 ' + report.filter(r => r.anchors).length + ' 条，其中 ' +
  unguarded.length + ' 条**没有任何纯 Node 测试变红**');

/* ⚠ 已知的"不红是对的"清单。每一条都要写明**为什么**不红 ——
 * 否则这个清单会变成"凡是红的都往这里塞"的橡皮图章。 */
const KNOWN_UNGUARDED = {
  'creepBrake → 0': '平地上被滚动阻力覆盖（第 80 轮查清）：0.14×16 = 2.24 m/s² ' +
    '单独就能停住一切 4 秒内滑动 < 9 m/s 的车，而蠕行刹车窗口是 spNow < 1.5，' +
    '完全被包含。关掉它对**行为**没有可观测影响 —— 这是真结论，不是漏测。' +
    '见 docs/parts-redesign.md §18.2 与 tools/_redproof_feel.js 的 informational 记录。'
};
const unexpected = unguarded.filter(r => !KNOWN_UNGUARDED[r.name]);
if (unguarded.length) {
  unguarded.forEach(r => {
    console.log('  · ' + r.name +
      (KNOWN_UNGUARDED[r.name] ? '（已知，理由见源码）' : ' —— **未登记**'));
  });
}
if (unexpected.length) {
  console.log('');
  console.log('有 ' + unexpected.length + ' 条未登记的无守卫变异 —— 请为该参数补测试，');
  console.log('或在 KNOWN_UNGUARDED 里写明为什么它不该被守。');
}
process.exit(unexpected.length === 0 ? 0 : 1);

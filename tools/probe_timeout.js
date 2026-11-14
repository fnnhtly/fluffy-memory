/* 探针：`timeout` 这个失败原因，玩家能不能提前知道？
 *
 * 三件事要分开量：
 *   1. 它到底可不可达（如果永远到不了，那就是死规则）；
 *   2. 关卡 JSON 里写的 `timeLimit: 120` 有没有被用上（怀疑是死字段）；
 *   3. 行驶期 HUD 上有没有任何"时间"读数（没有的话，玩家输给一个自己看不见的东西）。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');

const levelsDir = path.join(__dirname, '..', 'levels');
const levels = fs.readdirSync(levelsDir).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(levelsDir, f), 'utf8')));

console.log('--- 1. 关卡 JSON 的 timeLimit 字段 ---');
levels.forEach(lv => console.log(`  ${lv.levelId} ${lv.name}  timeLimit=${lv.timeLimit}`));

console.log('\n--- 2. 引擎里的硬编码上限 ---');
console.log('  Params.demoTimeLimit =', R.Params.demoTimeLimit);

console.log('\n--- 3. 标准解各自用时（看离上限多远）---');
const keys = ['1-1', '1-2', '1-3', '1-4i', '1-5m', '1-6'];
levels.forEach((lv, i) => {
  const k = keys[i] || lv.levelId;
  const sp = R.SPECS[k];
  if (!sp) return;
  const r = R.simulate(lv, sp, { maxTime: 90 });
  console.log(`  ${lv.levelId} ${r.result} @ ${(r.time || 0).toFixed(1)} s ` +
    `(用掉上限的 ${((r.time || 0) / R.Params.demoTimeLimit * 100).toFixed(0)}%)`);
});

console.log('\n--- 4. timeout 可达吗？用极慢的造法硬拖 ---');
/* 只放一块木框 + 猪，不放轮子 → 不能发射。所以用一个"能动但极慢"的车：
 * 木框 + 猪 + 一个很小的初速来源。最省事的做法是直接手改 state 再 simulate 不了，
 * 于是换个角度：把 demoTimeLimit 临时调到很小，看 resolve 会不会走 timeout。 */
const lv0 = levels[0];
const sp0 = R.SPECS['1-1'];
const r2 = R.simulate(lv0, sp0, { maxTime: 90, params: { demoTimeLimit: 1.0 } });
console.log(`  把上限压到 1.0 s 后跑 1-1 → ${r2.result} @ ${(r2.time || 0).toFixed(1)} s`);
const r3 = R.simulate(lv0, sp0, { maxTime: 90, params: { demoTimeLimit: 3.0 } });
console.log(`  压到 3.0 s → ${r3.result} @ ${(r3.time || 0).toFixed(1)} s`);
const r4 = R.simulate(lv0, sp0, { maxTime: 90, params: { demoTimeLimit: 100.0 } });
console.log(`  放到 100 s → ${r4.result} @ ${(r4.time || 0).toFixed(1)} s`);

console.log('\n--- 5. HUD 上有没有时间读数 ---');
const html = fs.readFileSync(path.join(__dirname, '..', 'prototype', 'index.html'), 'utf8');
const hudUsesTime = /(剩余时间|倒计时|timeLimit|state\.run\.time)/.test(html);
console.log('  index.html 引用 run.time / timeLimit ?', hudUsesTime);
const matches = html.match(/[^\n]*(state\.run\.time|timeLimit)[^\n]*/g) || [];
matches.forEach(m => console.log('   ', m.trim().slice(0, 110)));

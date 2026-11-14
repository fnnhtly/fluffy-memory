/* 探针：把 60 秒硬上限拿掉，那些"慢慢溜"的局最后会怎么结束？
 *
 * 这决定 timeout 到底是什么角色：
 *   - 如果拿掉上限后 stuck / 其它原因早晚会触发 → timeout 只是"兜底"，
 *     真正的问题是**玩家白等了几十秒**；
 *   - 如果拿掉上限后它也永远不结算 → timeout 是唯一出口，那它必须留在
 *     60 秒这个位置，且玩家得能提前看到"还剩多少时间"。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const lv5 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'levels', '05.json'), 'utf8'));
const lv1 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'levels', '01.json'), 'utf8'));

const cases = [
  { name: '1-5 单框单轮（慢慢溜）', lv: lv5, spec: { wood_frame: [[4, 1]], wood_wheel: [[5, 1]], pig: [[4, 1]] } },
  { name: '1-5 单框 + 电池（电池不驱动）', lv: lv5, spec: { wood_frame: [[4, 1]], wood_wheel: [[5, 1]], battery: [[2, 1]], pig: [[4, 1]] } },
  { name: '1-1 单框单轮', lv: lv1, spec: { wood_frame: [[4, 1]], wood_wheel: [[5, 1]], pig: [[4, 1]] } }
];

[60, 90, 150, 300, 600].forEach(limit => {
  console.log(`\n=== 上限 ${limit} 秒 ===`);
  cases.forEach(c => {
    const r = R.simulate(c.lv, c.spec, { maxTime: limit + 5, params: { demoTimeLimit: limit } });
    console.log(`  ${c.name}: ${r.result}/${r.failReason || '-'} @ ${(r.time || 0).toFixed(1)}s ` +
      `最远 x=${(r.car ? r.car.x : 0).toFixed(2)} / 终点 ${c.lv.goal.col}`);
  });
});

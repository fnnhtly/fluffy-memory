/* 探针：1-5 的「不用马达」这颗星，和标准解互相排斥吗？
 *
 * 量出来的事实：
 *   · 1-5 标准解 (`SPECS['1-5m']`) 自己装着马达 → 马达 2.90s → **永远拿不到** ★★★；
 *   · 把马达删掉 → 6.42s 到终点 → **拿到 ★★★**。
 *
 * 这是**对的**：标准解只是"怎么最快到终点"，不代表"怎么三星"。
 * 参考（捣蛋猪）里也是这个套路 —— 三星往往要求换一种更省/更慢的打法。
 *
 * 但有一个真正的风险要查：`motorUse` 的判据是 `state.motorUse <= ch.max`，
 * 而 `motorUse` 只在"车上有马达且还有电"时才累加。也就是说
 * **装了马达但不用它，也算 0 秒** —— 玩家可以把马达当配重挂在车上，
 * 一路让车自己滚下去，然后照样拿这颗星。
 * 这算不算"作弊"取决于设计意图：如果这颗星想奖励"根本不需要马达"，
 * 那挂着马达拿星就是漏判；如果它只想奖励"这一趟没耗电"，
 * 那当前实现是对的。这里量清楚这个漏洞有多容易踩。
 */
const R = require('../prototype/game.js');
const levels = require('../prototype/levels.js');
const lv = levels[4];   // 1-5

const spec = JSON.parse(JSON.stringify(R.SPECS['1-5m']));
console.log('=== 挂着马达但随着车自己滚（不打火？不行 —— 马达是自动的）===');
/* 马达在这游戏里是**被动的**：装上就自动给 6 m/s² 推力，没有"开关"。
 * 所以"挂着马达但不用"根本不存在 —— 一装就耗电。验证一下： */
{
  const withMotor = JSON.parse(JSON.stringify(spec));
  const r = R.simulate(lv, withMotor, { maxTime: 300 });
  console.log(`  装马达：马达 ${r.motorUse.toFixed(2)}s，★★★=${r.starGoals.challenge}`);
}
{
  const noMotor = JSON.parse(JSON.stringify(spec));
  delete noMotor.motor;
  const r = R.simulate(lv, noMotor, { maxTime: 300 });
  console.log(`  不装马达：马达 ${r.motorUse.toFixed(2)}s，★★★=${r.starGoals.challenge}，用时 ${r.time.toFixed(2)}s`);
}

console.log('\n=== 结论判定 ===');
console.log('  马达没有开关（装上就自动推），所以"挂着但不耗电"这条漏洞不存在；');
console.log('  这颗星的真实含义是"整趟不靠马达"，而且有另一条合法解能拿到它');
console.log('  （去掉马达、多滑 3.5 秒）。它是**有分量**的，不是死的。');

console.log('\n=== 顺便：1-5 去掉马达的车会不会被看门狗误杀？ ===');
{
  const noMotor = JSON.parse(JSON.stringify(spec));
  delete noMotor.motor;
  [8.0, 9.0, 10.0, 12.0].forEach(W => {
    const r = R.simulate(lv, noMotor, { maxTime: 300, params: { progressWindow: W } });
    console.log(`  progressWindow=${W}s → ${r.result}/${r.failReason || '-'} @ ${(r.time || 0).toFixed(2)}s`);
  });
}

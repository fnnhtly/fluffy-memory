/* 探针：那些"慢慢往下溜"的车，最后到底会不会自己溜到终点？
 *
 * 上一份（probe_timeout_trace）发现：1-5 上不放马达的车会以 0.2~0.4 m/s 匀速下滑，
 * 60 秒爬到 x≈14.9（终点 25），速度高于 stuck 的 0.2 阈值 —— 所以 stuck 不触发，
 * 只能靠 60 秒硬上限判 timeout。
 *
 * 关键问题：**如果给它足够时间，它能赢吗？**
 *   能赢 → 那 60 秒上限是在"惩罚一个合法但很慢的解"，时间上限应该宽松些；
 *   不能赢 → 那 60 秒只是让玩家白等，应该更早判定。
 *
 * 这条分歧决定 timeLimit 怎么定，所以必须先量。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const lv5 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'levels', '05.json'), 'utf8'));

const cases = [
  { name: '单框 + 单轮（无动力）', spec: { wood_frame: [[4, 1]], wood_wheel: [[5, 1]], pig: [[4, 1]] } },
  { name: '单框 + 电池 + 轮（电池不驱动）', spec: { wood_frame: [[4, 1]], wood_wheel: [[5, 1]], battery: [[2, 1]], pig: [[4, 1]] } },
  { name: '单框 + 双轮', spec: { wood_frame: [[4, 1]], wood_wheel: [[5, 1], [5, 1]], pig: [[4, 1]] } },
  { name: '1-5 标准解', spec: R.SPECS['1-5m'] }
];

console.log('1-5 终点 col =', lv5.goal.col, ' 起点 col =', lv5.start.col, '\n');
cases.forEach(c => {
  const out = [];
  [20, 40, 60, 90, 120, 180, 300].forEach(T => {
    const r = R.simulate(lv5, c.spec, { maxTime: T });
    out.push(`${T}s:${r.result}${r.result === 'win' ? '' : '/' + (r.failReason || '?')}@${(r.time || 0).toFixed(0)}s` +
      ` x=${(r.car ? r.car.x : 0).toFixed(1)}`);
  });
  console.log(c.name);
  out.forEach(o => console.log('   ', o));
  console.log('');
});

/* 探针：60 秒硬上限（timeout）到底还会不会触发？
 *
 * 已知（probe_timeout_role.js）：三个简单造法在关掉上限后都在 8 秒被
 * `no_progress` 判负 —— 也就是说看门狗总是先到，上限永远轮不上。
 *
 * 但那是三个样本。这里换成**每关 240 个随机造法**，带默认看门狗，
 * 把上限放到 600 秒，看两件事：
 *   1. 有没有任何一局跑到 20 秒以上？（有多久、怎么结束的）
 *   2. `timeout` 到底出现几次？
 *
 * 结论会决定一件玩家能看见的事：HUD 右上角那个 `12.34 s` 是**只涨不封**的
 * 秒表，而引擎在 60 秒会判负，失败卡上写「超时」。
 * 如果 timeout 永远不会触发，那"超时"这个词对玩家就是个不存在的规则；
 * 如果它偶尔会触发，那玩家就必须能看见还剩多少时间。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const levelsDir = path.join(__dirname, '..', 'levels');
const levels = fs.readdirSync(levelsDir).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(levelsDir, f), 'utf8')));
const KEYS = ['1-1', '1-2', '1-3', '1-4i', '1-5m', '1-6'];

let seed = 987654321;
function rnd(n) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; }

function randomBuild(lv) {
  const spec = {}; const cells = [];
  const nFrame = 1 + rnd(3);
  for (let i = 0; i < nFrame; i++) cells.push([4, 1 + i]);
  spec.wood_frame = cells;
  const box = lv.partsBox || {};
  if (Math.random() < 0.9) spec.wood_wheel = [[5, 1 + rnd(cells.length)]];
  if (box.iron_wheel && Math.random() < 0.4) {
    if (!spec.wood_wheel) spec.wood_wheel = [];
    spec.wood_wheel.push([3, 1 + rnd(cells.length)]);
  }
  if (box.motor && Math.random() < 0.6) spec.motor = [[3, 1 + rnd(cells.length)]];
  if (box.battery && Math.random() < 0.6) spec.battery = [[4, 1 + rnd(cells.length)]];
  if (box.pump && Math.random() < 0.5) spec.pump = [[2, 1 + rnd(cells.length)]];
  if (box.balloon && Math.random() < 0.6) spec.balloon = [[4, 1 + rnd(cells.length)]];
  if (box.sandbag && Math.random() < 0.5) spec.sandbag = [[2, 1 + rnd(cells.length)]];
  spec.pig = [[4, 1 + rnd(cells.length)]];
  return spec;
}

console.log('=== 每关 240 个随机造法（默认看门狗，上限 600 s）===');
let globalMax = 0, timeouts = 0, over20 = 0, total = 0;
const buckets = {};
levels.forEach((lv, i) => {
  let maxT = 0, cnt = {}, over = 0;
  for (let k = 0; k < 240; k++) {
    const spec = randomBuild(lv);
    const r = R.simulate(lv, spec, { maxTime: 900, params: { demoTimeLimit: 600 } });
    const t = r.time || 0;
    total++;
    maxT = Math.max(maxT, t);
    const key = r.result === 'win' ? 'win' : (r.failReason || '?');
    cnt[key] = (cnt[key] || 0) + 1;
    if (t > 20) over++;
  }
  globalMax = Math.max(globalMax, maxT);
  timeouts += cnt.timeout || 0;
  over20 += over;
  console.log(`  ${lv.levelId}: 最久 ${maxT.toFixed(2)} s，超过 20 s 的 ${over} 局，` +
    `结束原因 ${JSON.stringify(cnt)}`);
});
console.log(`\n合计 ${total} 局：最久 ${globalMax.toFixed(2)} s；timeout ${timeouts} 次；` +
  `超过 20 s 的 ${over20} 局`);

console.log('\n=== 上限本身能不能触发（把看门狗关掉、上限压到 5 s）===');
{
  const lv = levels[5];
  const r = R.simulate(lv, R.SPECS['1-6'], { maxTime: 60, params: { progressWindow: 1e9, demoTimeLimit: 5 } });
  console.log(`  1-6 标准解 + 关看门狗 + 上限 5 s → ${r.result}/${r.failReason || '-'} @ ${(r.time || 0).toFixed(2)}s`);
  const r2 = R.simulate(lv, R.SPECS['1-6'], { maxTime: 60, params: { progressWindow: 1e9, demoTimeLimit: 60 } });
  console.log(`  同上但上限 60 s（默认）→ ${r2.result}/${r2.failReason || '-'} @ ${(r2.time || 0).toFixed(2)}s`);
}

/* 探针：60 秒硬上限（Params.demoTimeLimit）距离真实通关到底有多远？
 *
 * 动机：关卡文件里每关都写着 `timeLimit: 120`，而引擎用的是**全局**的
 * `Params.demoTimeLimit = 60`。两个数说的是同一件事，却各写一份 ——
 * 关卡文件那个是死字段（改了不生效），引擎那个改了对所有关一起生效。
 * 这正是上一轮静态对账在找的那类"两个真相"问题，只不过这次在数据层。
 *
 * 在决定"该删掉哪一个"之前，得先量清楚：
 *   1. 六关的标准解各自要跑多久？（最慢的那关决定上限的下限）
 *   2. 玩家真实会造出来的车（随机抽样）里，有多少局是**赢但超过 60 秒**的？
 *      如果有，那 60 秒就是一个会在正常游玩中突然发作的 bug；
 *   3. 慢速通关（贴着终点线前磨蹭）最久能到多少秒？
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const levelsDir = path.join(__dirname, '..', 'levels');
const levels = fs.readdirSync(levelsDir).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(levelsDir, f), 'utf8')));
const KEYS = ['1-1', '1-2', '1-3', '1-4i', '1-5m', '1-6'];

console.log('=== 1. 六关标准解的通关耗时 ===');
const stdTimes = [];
levels.forEach((lv, i) => {
  const spec = R.SPECS[KEYS[i]];
  const r = R.simulate(lv, spec, { maxTime: 300 });
  const t = r.result === 'win' ? r.time : Infinity;
  if (r.result === 'win') stdTimes.push(t);
  console.log(`  ${lv.levelId} ${KEYS[i]}: ${r.result}/${r.failReason || '-'} @ ${(r.time || 0).toFixed(2)}s` +
    `  (关卡文件 timeLimit=${lv.timeLimit}, 引擎 demoTimeLimit=${R.Params.demoTimeLimit})`);
});
console.log(`  标准解最慢：${Math.max.apply(null, stdTimes).toFixed(2)} s，` +
  `距 60 s 上限还有 ${(60 - Math.max.apply(null, stdTimes)).toFixed(1)} s 余量`);

console.log('\n=== 2. 随机造法里有多少"赢但慢"？ ===');
let rnd = 12345;
function rndN(n) { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd % n; }
function randomBuild(lv) {
  const spec = {}; const cells = [];
  const nFrame = 1 + rndN(3);
  for (let i = 0; i < nFrame; i++) cells.push([4, 1 + i]);
  spec.wood_frame = cells;
  if (Math.random() < 0.9) spec.wood_wheel = [[5, 1 + rndN(cells.length)]];
  if (Math.random() < 0.5) {
    if (!spec.wood_wheel) spec.wood_wheel = [];
    spec.wood_wheel.push([3, 1 + rndN(cells.length)]);
  }
  if (lv.partsBox.motor && Math.random() < 0.6) spec.motor = [[3, 1 + rndN(cells.length)]];
  if (lv.partsBox.battery && Math.random() < 0.6) spec.battery = [[4, 1 + rndN(cells.length)]];
  if (lv.partsBox.pump && Math.random() < 0.4) spec.pump = [[2, 1 + rndN(cells.length)]];
  if (lv.partsBox.balloon && Math.random() < 0.6) {
    spec.balloon = [[4, 1 + rndN(cells.length)]];
    if (Math.random() < 0.4) spec.balloon.push([3, 1 + rndN(cells.length)]);
  }
  if (lv.partsBox.sandbag && Math.random() < 0.5) spec.sandbag = [[2, 1 + rndN(cells.length)]];
  spec.pig = [[4, 1 + rndN(cells.length)]];
  return spec;
}

levels.forEach((lv, i) => {
  let win = 0, winSlow = 0, maxWin = 0, n = 0;
  for (let k = 0; k < 120; k++) {
    const spec = randomBuild(lv);
    const r = R.simulate(lv, spec, { maxTime: 300, params: { demoTimeLimit: 1e9, progressWindow: 1e9 } });
    n++;
    if (r.result === 'win') {
      win++;
      maxWin = Math.max(maxWin, r.time);
      if (r.time > 60) winSlow++;
    }
  }
  console.log(`  ${lv.levelId}: ${win}/${n} 赢，最慢的通关 ${maxWin.toFixed(1)} s，` +
    `其中超过 60 s 的 ${winSlow} 局`);
});

console.log('\n=== 3. "贴着终点磨蹭"最久能多久？ ===');
{
  /* 标准解但把马达关掉、只靠打气筒慢慢蹭：模拟最慢的合法玩法。 */
  const lv = levels[1];
  const spec0 = R.SPECS['1-2'];
  const r = R.simulate(lv, spec0, { maxTime: 300, params: { demoTimeLimit: 1e9, progressWindow: 1e9 } });
  console.log(`  1-2 标准解去掉看门狗与上限：${r.result}/${r.failReason || '-'} @ ${(r.time || 0).toFixed(2)}s`);
}
console.log('\n（demoTimeLimit 是全局常量，与关卡文件的 timeLimit 字段互不相关）');

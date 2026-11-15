/* 探针：最慢的那几局"赢"到底用了多久？（决定 60 秒上限要不要给玩家看）
 *
 * 已知：1440 个随机造法里 timeout **一次都没触发**（probe_timeout_reach.js），
 * 最久的一局 47.58 秒结束。也就是说 60 秒这条线在真实游玩里只有
 * 12 秒余量，而 HUD 上那个 `12.34 s` 是**只涨不封**的秒表 ——
 * 玩家看不到自己离上限还有多远。
 *
 * 要么删掉这条规则（它反正不触发），要么让它可见。
 * 决定之前得先知道：合法通关的局最慢多久？如果有赢的局接近 60 秒，
 * 这条规则就不是"永远不触发"，而是"偶尔会误杀一个还在慢慢推进的玩家"。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const levelsDir = path.join(__dirname, '..', 'levels');
const levels = fs.readdirSync(levelsDir).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(levelsDir, f), 'utf8')));
const KEYS = ['1-1', '1-2', '1-3', '1-4i', '1-5m', '1-6'];

let seed = 55555555;
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

const wins = [];
let n = 0;
levels.forEach((lv) => {
  for (let k = 0; k < 240; k++) {
    const r = R.simulate(lv, randomBuild(lv), { maxTime: 900, params: { demoTimeLimit: 600 } });
    n++;
    if (r.result === 'win') wins.push({ lv: lv.levelId, t: r.time });
  }
});
wins.sort((a, b) => b.t - a.t);
console.log(`共 ${n} 局，赢 ${wins.length} 局。最慢的 12 局：`);
wins.slice(0, 12).forEach(w => console.log(`  ${w.lv}  ${w.t.toFixed(2)} s`));
const over50 = wins.filter(w => w.t > 50).length;
const over40 = wins.filter(w => w.t > 40).length;
const over30 = wins.filter(w => w.t > 30).length;
console.log(`  超过 30 s 的赢局 ${over30}，超过 40 s 的 ${over40}，超过 50 s 的 ${over50}`);
console.log(`  60 秒上限若生效，会误杀 ${over50} 局本该赢的（余量 ${over50 ? '不足' : '充裕'}）`);

console.log('\n=== 上限压到 30 s 会怎样（模拟"上限真的生效"）===');
let killed = 0;
levels.forEach((lv, i) => {
  const r = R.simulate(lv, R.SPECS[KEYS[i]], { maxTime: 60, params: { demoTimeLimit: 30 } });
  const r0 = R.simulate(lv, R.SPECS[KEYS[i]], { maxTime: 60 });
  if (r0.result === 'win' && r.result !== 'win') { killed++; console.log(`  ${lv.levelId} 标准解会被误杀`); }
});
console.log(`  六关标准解里被 30 秒上限误杀的：${killed} 关（说明上限压到 30 太狠）`);

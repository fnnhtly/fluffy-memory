/* 看门狗到底省了多少玩家时间？—— 直接对比"开/关"两次引擎跑出来的结果。
 *
 * 为什么不用 probe_watchdog_gain 那种"自己算 fireAt"的做法：
 * 那个探针现在跑的是**已经带看门狗**的引擎，局本来就提前结束了，
 * 于是它算出来的"有进展"永远是 0 —— 量到的是自己，不是效果。
 *
 * 正确做法：同一批造法跑两遍，一遍 Params.progressWindow = 1e9（等于关掉），
 * 一遍用默认值，比较两者的 time 分布。
 * 这是这个项目反复学到的同一条：**对照必须只改被测因素**。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const levelsDir = path.join(__dirname, '..', 'levels');
const levels = fs.readdirSync(levelsDir).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(levelsDir, f), 'utf8')));
const KEYS = ['1-1', '1-2', '1-3', '1-4i', '1-5m', '1-6'];

const OFF = { progressWindow: 1e9 };

function rnd(n) { return Math.floor(Math.random() * n); }
function randomBuild() {
  const spec = {}; const cells = []; const nFrame = 1 + rnd(3);
  for (let i = 0; i < nFrame; i++) cells.push([4, 1 + i]);
  spec.wood_frame = cells;
  if (Math.random() < 0.85) spec.wood_wheel = [[5, 1 + rnd(cells.length)]];
  if (Math.random() < 0.5) spec.wood_wheel = (spec.wood_wheel || []).concat([[5, 1 + rnd(cells.length)]]);
  if (Math.random() < 0.45) spec.motor = [[3, 1 + rnd(cells.length)]];
  if (Math.random() < 0.45) spec.battery = [[2, 1 + rnd(cells.length)]];
  if (Math.random() < 0.35) spec.pump = [[3, 1 + rnd(cells.length)]];
  spec.pig = [[4, 1]];
  return spec;
}

// 固定一批造法，两遍跑同样的
const cases = [];
levels.forEach(lv => { for (let i = 0; i < 60; i++) cases.push({ lv, spec: randomBuild() }); });

let onTotal = 0, offTotal = 0, changed = 0, mildMis = 0;
const detail = [];
cases.forEach(({ lv, spec }) => {
  const off = R.simulate(lv, spec, { maxTime: 90, params: OFF });
  const on = R.simulate(lv, spec, { maxTime: 90 });
  onTotal += on.time; offTotal += off.time;
  if (Math.abs(on.time - off.time) > 0.01) {
    changed++;
    if (off.result === 'win' && on.result !== 'win') mildMis++;
    detail.push({ level: lv.levelId, offT: off.time, onT: on.time,
      offR: off.result + '/' + (off.failReason || ''), onR: on.result + '/' + (on.failReason || '') });
  }
});

console.log(`共 ${cases.length} 局（同一批造法，跑两遍）`);
console.log(`  关掉看门狗：合计 ${offTotal.toFixed(0)} 秒，平均 ${(offTotal / cases.length).toFixed(2)} 秒/局`);
console.log(`  打开看门狗：合计 ${onTotal.toFixed(0)} 秒，平均 ${(onTotal / cases.length).toFixed(2)} 秒/局`);
console.log(`  省下 ${(offTotal - onTotal).toFixed(0)} 秒（${((offTotal - onTotal) / offTotal * 100).toFixed(1)}%）`);
console.log(`  结果有变化的局：${changed}`);
console.log(`  其中"原本能赢却判负"的：${mildMis}  ← 必须是 0`);

detail.sort((a, b) => (b.offT - b.onT) - (a.offT - a.onT));
console.log('\n省得最多的 10 局：');
detail.slice(0, 10).forEach(d =>
  console.log(`  ${d.level}  ${d.offT.toFixed(1)}s(${d.offR}) → ${d.onT.toFixed(1)}s(${d.onR})`));

// 标准解复核
console.log('\n标准解：');
let bad = 0;
levels.forEach((lv, i) => {
  const k = KEYS[i] || lv.levelId;
  if (!R.SPECS[k]) return;
  const r = R.simulate(lv, R.SPECS[k], { maxTime: 90 });
  const ok = r.result === 'win';
  if (!ok) bad++;
  console.log(`  ${lv.levelId} ${ok ? 'win' : 'FAIL/' + r.failReason} @ ${r.time.toFixed(1)}s stars=${r.stars}`);
});
console.log(bad === 0 ? '  ✓ 六关标准解全部获胜' : `  ✗ ${bad} 关被误杀`);

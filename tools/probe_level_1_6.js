/* 1-6「抬个头」的可通关性矩阵。
 *
 * 设计意图：气球和沙袋**都必须用**，而且有先后。
 *   1. 沙袋把车压在地上 → 能从高台滚下坡拿到水平速度
 *   2. 冲下坡后扔掉沙袋 → 净浮力变负 → 开始爬升，越过沟
 *   3. 飘过沟、落地（碰地的气球会破）
 *
 * 要验证的四件事（缺一条这关就没在教它该教的东西）：
 *   A. 只带气球 → 过不去（起手就被抬起，没有水平速度）
 *   B. 只带沙袋 → 过不去（冲进沟里）
 *   C. 都有但不扔沙袋 → 过不去
 *   D. 都有 + 在某个时刻扔 → 能过，而且窗口不是"随便什么时候都行"
 *
 * ⚠ 踩过的坑：可叠零件的第一次放置返回的对象里**没有 n 字段**
 * （只有"再点同一格"才返回 stacked/n），所以用 `res.n` 累计数量会得到
 * undefined，`while (需要 > undefined)` 直接不成立 —— 结果"放了 6 个气球"
 * 实际只放了 1 个，而后面所有数字都还是在正常打印，看起来毫无异常。
 * 数量一律从 `R.cellCount(b.cells[key])` 读。
 */
const R = require('../prototype/game.js');
const L6 = require('../levels/06.json');

const FRAMES = 4;

function mk(extra) {
  const lv = JSON.parse(JSON.stringify(L6));
  lv.partsBox = Object.assign({}, lv.partsBox, extra || {});
  delete lv.challenge;
  return lv;
}

/* 往 (r,c) 塞 n 个可叠件；返回实际塞进去的数量（受预算和 maxStack 限制） */
function stackInto(lv, b, part, r, c, n) {
  const key = r + ',' + c;
  const res = R.tryPlace(lv, b, part, r, c);
  if (!res.ok) return 0;
  let have = R.cellCount(b.cells[key]);
  while (have < Math.min(n, R.PARTS[part].maxStack || 3)) {
    const r2 = R.tryPlace(lv, b, part, r, c);
    if (!r2.ok) break;
    const got = R.cellCount(b.cells[key]);
    if (got <= have) break;     // 回绕到 1 了，说明已经到顶
    have = got;
  }
  return have;
}

/* 4 框横排 + 两端轮 + 猪在中间 = 7.5 kg */
function makeCar(lv, opt) {
  R.resetParams();
  const b = R.newBuild();
  const frames = opt.frames || FRAMES;
  for (let i = 0; i < frames; i++) R.tryPlace(lv, b, 'wood_frame', 4, i);
  R.tryPlace(lv, b, 'wood_wheel', 5, 0);
  R.tryPlace(lv, b, 'wood_wheel', 5, frames - 1);
  R.tryPlace(lv, b, 'pig', 4, 1);
  // 气球挂上方（row 3），沙袋挂下方（row 5）—— 都要贴着框
  let want = opt.balloons || 0;
  for (let c = 0; c < frames && want > 0; c++) {
    const got = stackInto(lv, b, 'balloon', 3, c, Math.min(3, want));
    want -= got;
  }
  want = opt.sandbags || 0;
  for (let c = 0; c < frames && want > 0; c++) {
    if (b.cells['5,' + c]) continue;          // 轮子占了
    const got = stackInto(lv, b, 'sandbag', 5, c, Math.min(3, want));
    want -= got;
  }
  return b;
}

function run(lv, b, opts) {
  opts = opts || {};
  const st = R.createRun(lv, b);
  const drops = (opts.dropAt || []).slice();
  let maxX = -9, minY = 99, maxY = -99;
  for (let i = 0; i < 60 * (opts.maxt || 25); i++) {
    if (st.phase !== 'run') break;
    while (drops.length && st.time >= drops[0]) { drops.shift(); R.dropSandbag(st); }
    R.step(st, 1 / 60);
    maxX = Math.max(maxX, st.car.x);
    maxY = Math.max(maxY, st.car.y);
    minY = Math.min(minY, st.car.y);
  }
  return {
    st, maxX, maxY, minY,
    res: st.result || st.failReason || 'running',
    lift: st.car.liftMass, net: st.car.netMass,
    pops: st.balloonPops, bags: st.car.sandbagCount, dropped: st.sandbagsDropped
  };
}

function show(tag, r) {
  const c = r.st.car;
  console.log(`  ${tag.padEnd(26)} ${String(r.res).padEnd(12)} 最远 x=${r.maxX.toFixed(1).padStart(5)}` +
    `  y ${r.minY.toFixed(1).padStart(5)}~${r.maxY.toFixed(1).padStart(5)}` +
    `  气破=${r.pops} 袋扔=${r.dropped}  净重 ${r.net.toFixed(2)}→终${c.netMass.toFixed(2)}`);
}

const cars = {};
const levels = {};
function prep(key, extra) {
  levels[key] = mk(extra);
  return levels[key];
}

console.log('=== 基准 ===');
{
  const lv = prep('base', {});
  const b = makeCar(lv, { balloons: 6, sandbags: 3 });
  const car = R.buildVehicle(lv, b);
  const bl = car.parts.filter(p => p.def.liftMass).reduce((a, p) => a + p.n, 0);
  const bgs = car.sandbagCount;
  console.log(`  4框+2轮+猪 = 7.5 kg；实测 mass=${car.mass.toFixed(2)}（气球 ${bl} 个 / 沙袋 ${bgs} 袋）`);
  console.log(`  lift=${car.liftMass.toFixed(2)}  net=${car.netMass.toFixed(2)}`);
  cars.full = b;
}
console.log('  地形 col8~9 是崖口（row11），col10~15 无地面（沟），col16+ row11');

console.log('\n=== A. 只有气球（6 个） ===');
{
  const lv = prep('A', { sandbag: 0 });
  show('6 气球 / 0 沙袋', run(lv, makeCar(lv, { balloons: 6, sandbags: 0 }), { maxt: 15 }));
}

console.log('\n=== B. 只有沙袋（3 个） ===');
{
  const lv = prep('B', { balloon: 0 });
  show('0 气球 / 3 沙袋', run(lv, makeCar(lv, { balloons: 0, sandbags: 3 }), { maxt: 15 }));
}

console.log('\n=== C. 都有，但不扔 ===');
{
  const lv = prep('C', {});
  show('6 气球 / 3 沙袋 / 不扔', run(lv, makeCar(lv, { balloons: 6, sandbags: 3 }), { maxt: 15 }));
}

console.log('\n=== D. 都有，在 t 时刻连扔 3 袋 ===');
for (const t of [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6]) {
  const lv = prep('D', {});
  show(`扔@${t.toFixed(1)}s`, run(lv, makeCar(lv, { balloons: 6, sandbags: 3 }), { dropAt: [t, t + 0.03, t + 0.06], maxt: 15 }));
}

console.log('\n=== 参考：两样都不给（证明它们真的必需） ===');
{
  const lv = prep('N', { balloon: 0, sandbag: 0 });
  show('0 气球 / 0 沙袋', run(lv, makeCar(lv, { balloons: 0, sandbags: 0 }), { maxt: 15 }));
}

/* 随机造法 —— **全项目唯一一份**（第 83 轮抽出，第 84 轮修格子冲突）。
 *
 * 为什么必须唯一：这个函数在不同脚本里各写一份的结果是
 *   round 81 漏 _drops、round 82 漏 _seeds、round 83 漏 umbrella/wind_wing，
 * 三次都量出了不存在的"缺陷"。
 *
 * 设计原则：
 *   1. **零件池从 level.partsBox 读**，不写死。这一关发什么就能随机放什么。
 *   2. **每一行维护已占用的列**（第 84 轮）。原来 propeller / umbrella /
 *      wind_wing 都从 `[3, 1+rnd(nFrame, R_)]` 里挑，会撞同一格；
 *      而 applySpec 是"后写覆盖先写"，于是 40% 的造法里**有零件被静默丢掉**。
 *      对 1-8 尤其致命 —— 伞被覆盖就等于风场托不动，必然失败。
 *      所以量到的"1-8 只有 0.68%"有一大半是这个 bug 造成的。
 *   3. 种子是 inner 件，放进一个**非猪**的框里。
 *   4. 种子有 85% 概率被触发，时刻随机在 0.6~6.0 秒
 *      （必须覆盖 1-8 的 3.75~6.0 窗口）。
 *
 * 用法：const { randomBuild } = require('./lib/random_build.js');
 */
function rnd(n, R_) { return Math.floor((R_ || Math.random)() * n); }

/* 带种子的伪随机（第 86 轮）。
 *
 * ── 为什么需要 ──
 *
 * `test_1_8_structure.js` 的 D 组量"哪几关最难"，用 `R_()`
 * 时同一份代码跑六次会有两次红 —— 因为 1-3 和 1-6 的真实通关率
 * 本来就在 6%~11% 之间重叠，谁高谁低完全看抽样运气。
 *
 * **判据没错，量具不可复现。** 一个"有时红有时绿"的判据比没有更糟：
 * 它训练人去重跑直到绿。
 *
 * 所以这里给一个可复现的随机源。测试用固定种子，
 * 换种子会得到不同的样本 —— 但同一次运行永远相同。
 *
 * 用法：const { seededBuild } = require('./lib/random_build.js');
 *       const build = seededBuild(12345);
 *       const spec = build(lv);
 */
function makeRng(seed) {
  /* xorshift32 —— 够用、无依赖、周期 2^32−1 */
  let s = (seed | 0) || 0x9e3779b9;
  return function () {
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5; s |= 0;
    return ((s >>> 0) / 4294967296);
  };
}

function randomBuild(lv, rand) {
  const R_ = rand || Math.random;
  const box = (lv && lv.partsBox) || {};
  const spec = {};
  const nFrame = 1 + rnd(3, R_);
  const frames = [];
  for (let i = 0; i < nFrame; i++) frames.push([4, 1 + i]);
  spec.wood_frame = frames;

  /* 每一行已占用的列 */
  const used = { 3: new Set(), 5: new Set() };
  function takeCell(row) {
    const free = [];
    for (let c = 1; c <= nFrame; c++) if (!used[row].has(c)) free.push(c);
    if (!free.length) return null;
    const c = free[rnd(free.length, R_)];
    used[row].add(c);
    return [row, c];
  }

  /* 轮子：85% 一个、50% 两个（行 5） */
  if (box.wood_wheel > 0 || box.iron_wheel > 0) {
    const useIron = (box.iron_wheel > 0 && R_() < 0.3);
    const key = useIron ? 'iron_wheel' : 'wood_wheel';
    const first = takeCell(5);
    if (first) {
      spec[key] = [first];
      if (R_() < 0.5) {
        const second = takeCell(5);
        if (second) spec[key] = spec[key].concat([second]);
      }
    }
  }

  /* 驱动件：风车桨 / 喷气口 / 仙术机关，各 45%（行 3） */
  ['propeller', 'jet', 'pump'].forEach(k => {
    if (box[k] > 0 && R_() < 0.45) {
      const cell = takeCell(3);
      if (cell) spec[k] = [cell];
    }
  });

  /* 吃风件（行 3）：必须真的放得下 —— 1-8 全靠它 */
  ['umbrella', 'wind_wing'].forEach(k => {
    if (box[k] > 0 && R_() < 0.6) {
      const cell = takeCell(3);
      if (cell) spec[k] = [cell];
    }
  });

  /* 可叠件：气球行 3、沙袋行 5 */
  if (box.balloon > 0 && R_() < 0.5) {
    const cell = takeCell(3);
    if (cell) {
      spec.balloon = [cell];
      spec._stacks = Object.assign(spec._stacks || {}, { balloon: 1 + rnd(3, R_) });
    }
  }
  if (box.sandbag > 0 && R_() < 0.5) {
    const cell = takeCell(5);
    if (cell) {
      spec.sandbag = [cell];
      spec._stacks = Object.assign(spec._stacks || {}, { sandbag: 1 + rnd(3, R_) });
    }
  }

  /* 种子（inner 件，放进一个非猪的框） */
  const seedKinds = [];
  if (box.anemo_core > 0) seedKinds.push('anemo');
  if (box.geo_core > 0) seedKinds.push('geo');
  if (box.electro_core > 0) seedKinds.push('electro');
  if (seedKinds.length && R_() < 0.75) {
    const kind = seedKinds[rnd(seedKinds.length, R_)];
    const free = frames.slice(1);
    const cell = free.length ? free[rnd(free.length, R_)] : frames[0];
    spec[kind + '_core'] = [cell];
    if (R_() < 0.85) {
      /* 触发时刻的范围必须覆盖**所有关卡**的窗口。
       * 三关的位置完全不同：1-5 屏障在前段（1.4s）、1-7 台阶在中段（2.5s）、
       * 1-8 坡在后段（3.75s 起）。范围 0.6~6.0 覆盖整个跨度。 */
      spec._seeds = [{ t: +(0.6 + R_() * 5.4).toFixed(2), kind: kind }];
    }
  }

  spec.pig = [[4, 1]];
  return spec;
}

module.exports = { randomBuild, makeRng };

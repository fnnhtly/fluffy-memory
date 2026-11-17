/* 随机造法 —— **全项目唯一一份**（第 83 轮抽出）。
 *
 * 为什么必须唯一：这个函数在不同脚本里各写一份的结果是
 *   round 81 漏 _drops、round 82 漏 _seeds、round 83 漏 umbrella/wind_wing，
 * 三次都量出了不存在的"缺陷"。
 *
 * 设计原则：
 *   1. **零件池从 level.partsBox 读**，不写死。这一关发什么就能随机放什么。
 *   2. 每个零件只放一次（同一格），位置在合法的 3/4/5 行。
 *   3. 种子是 inner 件，放进一个**非猪**的框里。
 *   4. 种子有 85% 概率被触发，时刻随机在 0.6~3.8 秒。
 *
 * 用法：const { randomBuild } = require('./lib/random_build.js');
 */
function rnd(n) { return Math.floor(Math.random() * n); }

function randomBuild(lv) {
  const box = (lv && lv.partsBox) || {};
  const spec = {};
  const nFrame = 1 + rnd(3);
  const frames = [];
  for (let i = 0; i < nFrame; i++) frames.push([4, 1 + i]);
  spec.wood_frame = frames;

  /* 轮子：85% 一个、50% 两个 */
  if (box.wood_wheel > 0 || box.iron_wheel > 0) {
    const wheel = (box.iron_wheel > 0 && Math.random() < 0.3) ? 'iron_wheel' : null;
    if (wheel) {
      spec.iron_wheel = [[5, 1 + rnd(nFrame)]];
      if (Math.random() < 0.5) spec.iron_wheel = spec.iron_wheel.concat([[5, 1 + rnd(nFrame)]]);
    } else if (box.wood_wheel > 0) {
      spec.wood_wheel = [[5, 1 + rnd(nFrame)]];
      if (Math.random() < 0.5) spec.wood_wheel = spec.wood_wheel.concat([[5, 1 + rnd(nFrame)]]);
    }
  }

  /* 驱动件：风车桨 / 喷气口 / 仙术机关，各 45% */
  ['propeller', 'jet', 'pump'].forEach(k => {
    if (box[k] > 0 && Math.random() < 0.45) spec[k] = [[3, 1 + rnd(nFrame)]];
  });

  /* 吃风件（第 83 轮补上）：这是 1-8 之前 0% 的根源。
   * 它们必须放在**框上方**（tether 要求），和驱动件同一行。 */
  ['umbrella', 'wind_wing'].forEach(k => {
    if (box[k] > 0 && Math.random() < 0.6) spec[k] = [[3, 1 + rnd(nFrame)]];
  });

  /* 可叠件 */
  if (box.balloon > 0 && Math.random() < 0.5) {
    spec.balloon = [[3, 1 + rnd(nFrame)]];
    spec._stacks = Object.assign(spec._stacks || {}, { balloon: 1 + rnd(3) });
  }
  if (box.sandbag > 0 && Math.random() < 0.5) {
    spec.sandbag = [[5, 1 + rnd(nFrame)]];
    spec._stacks = Object.assign(spec._stacks || {}, { sandbag: 1 + rnd(3) });
  }

  /* 种子（inner 件，放进一个非猪的框） */
  const seedKinds = [];
  if (box.anemo_core > 0) seedKinds.push('anemo');
  if (box.geo_core > 0) seedKinds.push('geo');
  if (box.electro_core > 0) seedKinds.push('electro');
  if (seedKinds.length && Math.random() < 0.75) {
    const kind = seedKinds[rnd(seedKinds.length)];
    const free = frames.slice(1);
    const cell = free.length ? free[rnd(free.length)] : frames[0];
    spec[kind + '_core'] = [cell];
    if (Math.random() < 0.85) {
      /* ⚠ 触发时刻的范围必须覆盖**所有关卡**的窗口。
       *
       * 第 83 轮第一版写 0.6~3.8 秒，于是 1-8 的通关率只有 0.4% ——
       * 而 1-8 的风种窗口是 **3.75~6.0 秒**（第 78 轮量的）。
       * 0.6~3.8 几乎够不到它。
       *
       * 三关的窗口位置完全不同，这本身是设计信息：
       *   1-5 屏障在前段 → 早按（1.4 秒）
       *   1-7 台阶在中段 → 中按（2.5 秒）
       *   1-8 坡在后段   → 晚按（3.75 秒起）
       * 量具的采样范围必须覆盖这个跨度，否则它量的是"我的采样窗口"
       * 而不是"玩家的机会"。改成 0.6~6.0。 */
      spec._seeds = [{ t: +(0.6 + Math.random() * 5.4).toFixed(2), kind: kind }];
    }
  }

  spec.pig = [[4, 1]];
  return spec;
}

module.exports = { randomBuild };

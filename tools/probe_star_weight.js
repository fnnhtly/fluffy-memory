/* 探针：六颗 ★★★ 各自有多少"分量"？（第三版：拿标准解做扰动）
 *
 * 前两版都栽在**抽样方式**上：
 *   v1 每关 300 个纯随机造法 → 1-1/1-2/1-4/1-6 一局都赢不了，
 *      只有 1-3/1-5 中了几个，于是 1-3 读到"7/7 = 100% 白送"。
 *   v2 把零件箱限死、按键喂进去，还是赢 0 局 —— 说明**纯随机造法几乎赢不了**，
 *      这个游戏的标准解都很具体（轮子必须在第 5 列、马达电池必须落在特定格）。
 *
 * 结论：不能用"随机造法"来量星的通过率，那是在量"随机构造的成功率"，
 * 不是量星。正确做法是**拿标准解做单点扰动** —— 保证每一辆都接近能赢，
 * 只在"这颗星关心的那一个维度"上变化。这样：
 *   · 出现"赢了但没拿星" ⇒ 星有分量；
 *   · 全部赢局都拿星 ⇒ 星是白送的（玩家不需要为它做任何决定）。
 */
const R = require('../prototype/game.js');
const levels = require('../prototype/levels.js');
const KEYS = ['1-1', '1-2', '1-3', '1-4i', '1-5m', '1-6'];

function clone(o) { return JSON.parse(JSON.stringify(o)); }
/* 轮子可能叫 wood_wheel 也可能叫 iron_wheel（1-4 冰面关就只用铁轮）。
 * 第一版直接写 `spec.wood_wheel[0]`，在 1-4 上 undefined 崩了 ——
 * 造法扰动器必须按"这辆车实际用了哪种轮"来改。 */
function wheelKey(spec) {
  return spec.iron_wheel ? 'iron_wheel' : (spec.wood_wheel ? 'wood_wheel' : null);
}

/* 每关的扰动器：只改这颗星关心的那一维，别的照标准解抄。 */
const PERTURB = {
  /* 1-1「不散架」：把车做高（多叠框）→ 更容易翻倒散架；少一个框 → 更容易被撞碎 */
  '1-1'(spec) {
    const out = [];
    const base = clone(spec);
    out.push(base);
    // 少一个轮子 → 会翻
    const noRear = clone(spec); noRear.wood_wheel = [noRear.wood_wheel[0]]; out.push(noRear);
    // 轮子放到最高那格 → 重心高，容易翻
    const high = clone(spec); high.wood_wheel = [[5, 3]]; out.push(high);
    // 只留一个框、猪在顶上 → 车极轻，容易飞起来散架
    const tiny = clone(spec); tiny.wood_frame = [[4, 2]]; tiny.wood_wheel = [[5, 2]];
    tiny.pig = [[4, 2]]; out.push(tiny);
    return out;
  },
  /* 1-2「不按打气筒 ≤1 次」：标准解只按一次。这里造出按 0 次 / 2 次 / 3 次的版本 */
  '1-2'(spec) {
    const out = [];
    const base = clone(spec);
    out.push(base);
    [[1, 0], [2, 3], [3, 5]].forEach(([n, t0]) => {
      const v = clone(spec);
      v._presses = [];
      for (let i = 0; i < n; i++) {
        v._presses.push({ t: t0 + i * 1.5, k: 'press' });
        v._presses.push({ t: t0 + i * 1.5 + 0.3, k: 'release' });
      }
      out.push(v);
    });
    return out;
  },
  /* 1-3「能量剩 ≥30」：只改"马达开多久"—— 关掉、开一半、全开 */
  '1-3'(spec) {
    const out = [];
    out.push(clone(spec));
    const noMotor = clone(spec); delete noMotor.motor; delete noMotor.battery;
    out.push(noMotor);
    const short = clone(spec);
    short._presses = [{ t: 0.6, k: 'press' }, { t: 0.9, k: 'release' }];
    out.push(short);
    return out;
  },
  /* 1-4「不翻车 ≤45°」：把轮子挪到边上 / 去掉一侧 → 容易翻 */
  '1-4i'(spec) {
    const out = [];
    out.push(clone(spec));
    const wk = wheelKey(spec);
    const oneSide = clone(spec); oneSide[wk] = [oneSide[wk][0]]; out.push(oneSide);
    const high = clone(spec); high[wk] = [[5, 3]]; out.push(high);
    const light = clone(spec); light.wood_frame = [[4, 1], [4, 2]]; light.pig = [[4, 1]];
    out.push(light);
    return out;
  },
  /* 1-5「不用马达」：标准解完全不装马达。这里加上马达（一定超过 0 秒） */
  '1-5m'(spec) {
    const out = [];
    out.push(clone(spec));
    const withMotor = clone(spec); withMotor.motor = [[3, 1]]; out.push(withMotor);
    const withBoth = clone(spec); withBoth.motor = [[3, 1]]; withBoth.battery = [[4, 1]];
    out.push(withBoth);
    return out;
  },
  /* 1-6「沙袋全扔完」：改扔几个 */
  '1-6'(spec) {
    const out = [];
    out.push(clone(spec));
    [0, 1, 2].forEach(n => {
      const v = clone(spec);
      v._drops = [{ t: 4.5, n: n }];
      out.push(v);
    });
    return out;
  }
};

console.log('关卡 | 扰动数 | 赢局 | 赢且拿星 | 结论');
console.log('-----|--------|------|----------|------');
levels.forEach((lv, i) => {
  const key = KEYS[i];
  const variants = PERTURB[key](clone(R.SPECS[key]));
  let win = 0, pass = 0;
  const detail = [];
  variants.forEach((v, k) => {
    const r = R.simulate(lv, v, { maxTime: 300, params: { demoTimeLimit: 600 } });
    const star = !!(r.starGoals && r.starGoals.challenge);
    if (r.result === 'win') { win++; if (star) pass++; }
    detail.push(`    v${k}: ${r.result}/${r.failReason || '-'} @ ${(r.time || 0).toFixed(2)}s ` +
      `剩电 ${(r.car ? r.car.energy : 0).toFixed(0)} 马达 ${(r.motorUse || 0).toFixed(2)}s ` +
      `打气 ${r.pumpPress} 倾角 ${((r.maxAngle || 0) * 180 / Math.PI).toFixed(0)}° ` +
      `散架 ${r.hullBroken} 剩袋 ${(r.sandbagTotal || 0) - (r.sandbagsDropped || 0)} → ★${star ? '有' : '无'}`);
  });
  const verdict = !win ? '**没有赢局** ⇒ 这颗星根本拿不到，是死的'
    : (pass === win ? '**白送**（所有赢局都拿到）'
      : (pass === 0 ? '**太狠**（赢局都拿不到）' : '有分量（存在"赢了但没拿星"）'));
  console.log(`${lv.levelId} | ${String(variants.length).padStart(6)} | ${String(win).padStart(4)} | ` +
    `${String(pass).padStart(8)} | ${verdict}`);
  detail.forEach(d => console.log(d));
});

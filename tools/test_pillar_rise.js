/* 岩柱升起的过程（`pillarRise`）没有测试守着（第 88 轮）。
 *
 * ── 批量变异扫出来的洞 ──
 *
 * `tools/mutation_sweep.js` 对 19 个参数施加极端变异，跑全部 33 个纯 Node 测试。
 * 结果里两条**没有任何测试变红**：
 *
 *   · `pillarRise` 0.35 → 0
 *   · `creepBrake` 2.5 → 0
 *
 * `creepBrake` 那条第 80 轮已经查清并记为"平地上冗余"（滚动阻力覆盖它），
 * 是**真结论**，不是漏测。
 *
 * `pillarRise` 不一样。它的注释写得很清楚：
 *
 *   > 0.35 秒升 3 米 = 8.6 m/s 的地面速度…更慢的话车会先滑出柱子的范围，
 *   > 更快的话视觉上像瞬移。
 *
 * 三句话都是有内容的断言，但**一条测试都没有**。
 *
 * ── 写这个脚本时又踩了一个坑（第七次）──
 *
 * 第一版这样写：
 *
 *     R.resetParams({ pillarRise: rise });
 *     R.simulate(LV, SPEC, { maxTime: 70, trace: tr });
 *
 * 三次运行的 y 轨迹**完全相同**（差 0.00 米）。原因不是参数没用，
 * 而是 `simulate` 的**第一行**就是 `resetParams(opts.params)` ——
 * 它把参数重置回默认，我外面调的那次被覆盖了。
 *
 * 正确写法是 `simulate(LV, SPEC, { params: { pillarRise: rise }, … })`。
 * 这是同一个病的第七种形态：**量具以为自己在设参数，其实没有**。
 */
const R = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');
const { SPEC_OF } = require('./lib/specmap.js');

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

const LV = LEVELS[6];          // 1-7「升起岩柱」
const SPEC = JSON.parse(JSON.stringify(R.SPECS[SPEC_OF['1-7']]));

/* ⚠ 参数必须走 opts.params —— simulate 开头会 resetParams(opts.params)，
 * 在外面先调 resetParams 是无效的（第一版就这么错的）。 */
function runWith(rise) {
  const tr = [];
  const st = R.simulate(LV, JSON.parse(JSON.stringify(SPEC)),
    { maxTime: 70, trace: tr, params: { pillarRise: rise } });
  return { st, tr };
}

const base = runWith(0.35);
const slow = runWith(2.0);
const fast = runWith(0.02);

/* A 过程必须不同 —— 否则这个参数真的什么都没做 */
{
  let maxDiff = 0, at = 0;
  const n = Math.min(base.tr.length, slow.tr.length);
  for (let i = 0; i < n; i++) {
    const d = Math.abs(base.tr[i].y - slow.tr[i].y);
    if (d > maxDiff) { maxDiff = d; at = base.tr[i].t; }
  }
  const p = base.st.pillars && base.st.pillars[0];
  lines.push('柱子：中心 x=' + (p ? p.x.toFixed(2) : '?') + '，底 ' +
    (p ? p.base.toFixed(2) : '?') + ' → 顶 ' + (p ? p.top.toFixed(2) : '?') +
    '，riseTime=' + (p ? p.riseTime : '?') + '，born=' + (p ? p.born.toFixed(2) : '?'));
  lines.push('pillarRise 0.35 vs 2.0 的 y 轨迹最大差：' + maxDiff.toFixed(2) +
    ' 米（t=' + at.toFixed(2) + '）');
  lines.push('终点：' + base.st.result + ' / ' + slow.st.result + ' / ' +
    fast.st.result + '；时长 ' + base.st.time.toFixed(2) + ' / ' +
    slow.st.time.toFixed(2) + ' / ' + fast.st.time.toFixed(2) + ' 秒');
  chk('A 改 pillarRise 会改变升起过程（y 轨迹差 ≥ 0.3 米）',
    maxDiff >= 0.3, maxDiff.toFixed(2) + 'm');
}

/* B 升起期间车不能被甩出柱子的可达范围 */
{
  /* 只在**升起过程内**统计（born → born + riseTime）。升完之后车
   * 当然要往终点开，那时它离柱心很远是正常的。 */
  function maxOutDuringRise(tr, st) {
    const p = st.pillars && st.pillars[0];
    if (!p) return null;
    const reach = p.w / 2 + (p.cap || 0);
    let worst = -1e9, worstT = 0;
    for (const f of tr) {
      if (f.t < p.born) continue;
      const over = Math.abs(f.x - p.x) - reach;
      if (over > worst) { worst = over; worstT = f.t; }
      /* 升完之后只再看 0.5 秒（车正在驶离） */
      if (f.t > p.born + 0.5) break;
    }
    return { over: worst, t: worstT, reach };
  }
  const b = maxOutDuringRise(base.tr, base.st);
  const s = maxOutDuringRise(slow.tr, slow.st);
  lines.push('柱可达半径 ' + (b ? b.reach : '?') + ' 米；升起期内的最大超出量：' +
    '正常 ' + b.over.toFixed(2) + ' / 慢升 ' + s.over.toFixed(2) + ' 米' +
    '（负数 = 仍在范围内）');
  /* ⚠ `over` 是 |x − 柱心| − 可达半径，**负数表示还在范围内**。
   * 第一版写 `Math.abs(b.over) <= 0.5` —— 把 −3.32 变成 3.32 判红，
   * 而 −3.32 恰恰是"车贴着柱心"的最好情况。符号写反了。 */
  chk('B 升起期间车没有滑出柱子的可达范围（over ≤ 0.5 米）',
    b.over <= 0.5 && s.over <= 0.5,
    '正常 ' + b.over.toFixed(2) + ' / 慢 ' + s.over.toFixed(2));
}

/* C 升得快时车会不会被弹飞 */
{
  lines.push('最大俯仰：快升 ' + (fast.st.maxAngle || 0).toFixed(2) +
    ' / 正常 ' + (base.st.maxAngle || 0).toFixed(2) +
    ' / 慢升 ' + (slow.st.maxAngle || 0).toFixed(2) + ' 弧度');
  /* 快升（0.02 秒升 3 米 = 150 m/s 的地面速度）确实会造成更大的穿透量，
   * 但弹簧模型每帧只处理几厘米，所以不该翻车。这条守的就是"不该翻"。 */
  chk('C 0.02 秒升完也不会把车掀翻（俯仰 ≤ 90°）',
    (fast.st.maxAngle || 0) <= Math.PI * 0.5,
    (fast.st.maxAngle || 0).toFixed(2) + ' rad');
}

/* D 快升时车真的被抬上去了吗 */
{
  const p = base.st.pillars && base.st.pillars[0];
  function peakY(tr) { return Math.max(...tr.map(f => f.y)); }
  if (p) {
    lines.push('柱顶 y=' + p.top.toFixed(2) + '；车到达的最高 y：正常 ' +
      peakY(base.tr).toFixed(2) + ' / 快升 ' + peakY(fast.tr).toFixed(2));
    chk('D 两种速度下车都真的被抬到了柱顶附近（≥ top − 1.5）',
      peakY(base.tr) >= p.top - 1.5 && peakY(fast.tr) >= p.top - 1.5,
      peakY(base.tr).toFixed(2) + ' / ' + peakY(fast.tr).toFixed(2));
  }
}

/* E 结论：这一关仍然三星 */
chk('E 1-7 标准解仍然三星通关',
  base.st.result === 'win' && base.st.stars === 3,
  base.st.result + '/' + base.st.stars);

/* F **默认值本身**要在一个量出来的安全区间里（第 88 轮的真正修法）
 *
 * ⚠ A~E 全都显式传了 `params: { pillarRise: rise }`，所以它们**完全不看**
 * 源码里的默认值。批量变异把 `pillarRise: 0.35` 改成 `0.0` 时，
 * A~E 照样全绿 —— 换句话说这五条判据**没有守住那个默认值**。
 *
 * 这条才是变异能拆到的那一条。区间两端都是量出来的：
 *   0.02 秒 → 3 米/0.02 = 150 m/s 的地面速度（俯仰 0.61 rad，勉强不翻）
 *   2.00 秒 → 车在柱顶上待了 1.4 秒，时长从 5.68 涨到 7.07
 *   0.35 秒 → 8.6 m/s，正常
 *
 * 所以要求默认值落在 [0.10, 1.50]：低于 0.10 太快（穿透量顶到弹簧上限的风险），
 * 高于 1.50 太慢（车要在柱顶上等）。 */
{
  /* ⚠ 必须显式 `resetParams({})` 再读 —— `simulate` 内部会 resetParams，
   * 而 resetParams 是**全局**的：上面 `runWith(0.02)` 跑完之后
   * `R.Params.pillarRise` 停在 0.02，不是源码默认的 0.35。
   *
   * 第一次写这条时就是这么错的（F 组报"默认 pillarRise = 0.02"）。
   * 这是同一个病的第八种形态：量具读了一个被前一步改过的全局量。 */
  R.resetParams({});
  const def = R.Params.pillarRise;
  lines.push('默认 pillarRise = ' + def + ' 秒（区间 [0.10, 1.50]）');
  chk('F 默认 pillarRise 在量出来的安全区间 [0.10, 1.50] 内',
    def >= 0.10 && def <= 1.50, def + ' 秒');
}

/* G 用**默认参数**跑一遍，从轨迹反推真实的升起时长
 *
 * ⚠ 不能事后调 `groundY(st, p.x)` 量高度 —— 它读的是 `state.time`，
 * 而 simulate 跑完之后 time 已经到 5.68，`now − born = 2.97` 远大于 riseTime，
 * 于是永远返回满高（第一次写时 G 组报"用时 0 秒"）。
 *
 * 升起过程只能从**轨迹**反推：车被上升的地面顶上去，
 * 所以车的 y 从 `base` 附近涨到柱顶附近所用的时间，就是升起时长。 */
{
  const tr = [];
  const st = R.simulate(LV, JSON.parse(JSON.stringify(SPEC)), { maxTime: 70, trace: tr });
  const p = st.pillars && st.pillars[0];
  if (!p) {
    chk('G 前提：默认参数下 1-7 真的升起了岩柱', false, '没有柱子');
  } else {
    /* 柱子从 base 长到 top；车在柱顶上，所以找"车第一次到 top − 0.3"的时刻 */
    let reach = null;
    for (const f of tr) {
      if (f.t < p.born) continue;
      if (f.y >= p.top - 0.3) { reach = f.t; break; }
    }
    const dur = reach === null ? null : +(reach - p.born).toFixed(2);
    lines.push('默认参数下：柱子 born=' + p.born.toFixed(2) +
      '，车到达柱顶 ' + (reach === null ? '?' : reach.toFixed(2)) +
      '，用时 ' + dur + ' 秒（riseTime=' + p.riseTime + '）');
    chk('G 默认参数下柱子确实在 0.10~1.50 秒内把车顶到柱顶',
      dur !== null && dur >= 0.0 && dur <= 1.50, dur + ' 秒');
    chk('G2 而且车没有被掀翻（俯仰 ≤ 90°）',
      (st.maxAngle || 0) <= Math.PI * 0.5,
      (st.maxAngle || 0).toFixed(2) + ' rad');
  }
}

console.log(lines.join('\n'));
console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
process.exit(fail ? 1 : 0);

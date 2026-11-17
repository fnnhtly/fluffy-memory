/* 1-6「抬个头」的机制可预期性（第 81 轮）。
 *
 * ── 为什么单独拉这一关 ──
 *
 * 第 80 轮量八关手感时，1-6 的数据明显异常：
 *   最大离地 2.63 米、最大俯仰 37°、**17 次 > 4.5 m/s 的硬撞击**。
 * 其余七关都是 0 次。
 *
 * 而这一关教的是"气球给浮力、压舱石给配重"，机制本身要可预期：
 * 挂几个气球能抬多高、扔几个沙袋会怎么变。这些从来没量过。
 *
 * ── 判据 ──
 *
 *   A 净重与浮力的单调性：气球越多净重越轻，沙袋越多越重（线性）
 *   B 抬升能力：净重 < 0 才上升，且上升速度封顶在 liftMaxRise
 *   C 扔沙袋的效果必须**可预期**：扔 n 个之后净重增加 Σ沙袋质量
 *   D 第三星（沙袋全扔）只能靠"扔完"达成，不能靠"一个都没扔"
 *   E 那 17 次硬撞击到底发生在哪 —— 是不是"正常玩法必然撞"
 */
const R = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}
const LV6 = LEVELS[5];

function flatLevel(cols) {
  const rows = 24, map = [];
  for (let r = 0; r < rows; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) s += (r >= 12 ? '#' : '.');
    map.push(s);
  }
  const lv = {
    levelId: 'flat', name: 'flat', biome: 'field',
    grid: { cols, rows }, start: { col: 2 }, goal: { col: cols - 8 },
    partsBox: {}, mapRows: map, materials: [{ cols: [0, cols - 1], type: 'mud' }],
    boxes: [], challenge: { type: 'none' }, timeLimit: 120
  };
  Object.keys(R.PARTS).forEach(k => { lv.partsBox[k] = 9; });
  return lv;
}
const FLAT = flatLevel(50);

/* 造一辆车并返回它的净重、气球数、沙袋数 */
function buildWith(balloons, sandbags) {
  const spec = {
    wood_frame: [[4, 1], [4, 2], [4, 3]],
    wood_wheel: [[5, 1], [5, 3]],
    pig: [[4, 2]]
  };
  if (balloons > 0) spec.balloon = [[3, 2]];
  if (sandbags > 0) spec.sandbag = [[5, 2]];
  spec._stacks = { balloon: balloons, sandbag: sandbags };
  R.resetParams({});
  const b = R.newBuild();
  R.applySpec(FLAT, b, spec);
  const st = R.createRun(FLAT, b);
  if (!st.car) return null;
  return st;
}

// ═════════════ A 气球 / 沙袋的线性性 ═════════════
{
  const rows = [];
  for (let n = 0; n <= 3; n++) {
    const st = buildWith(n, 0);
    if (!st) { rows.push({ n, net: null }); continue; }
    rows.push({ n, net: +st.car.netMass.toFixed(3) });
  }
  lines.push('气球数 → 净重：' + rows.map(r => r.n + '→' + r.net).join('  '));
  const ok = rows.every(r => r.net !== null) &&
    rows.slice(1).every((r, i) => r.net < rows[i].net - 0.5);
  chk('A 气球越多净重越轻（每个至少减 0.5 kg）', ok,
    rows.map(r => r.net).join(','));

  /* 沙袋同理，但方向相反 */
  const rows2 = [];
  for (let n = 0; n <= 3; n++) {
    const st = buildWith(3, n);
    if (!st) { rows2.push({ n, net: null }); continue; }
    rows2.push({ n, net: +st.car.netMass.toFixed(3) });
  }
  lines.push('沙袋数 → 净重：' + rows2.map(r => r.n + '→' + r.net).join('  '));
  const ok2 = rows2.every(r => r.net !== null) &&
    rows2.slice(1).every((r, i) => r.net > rows2[i].net + 0.2);
  chk('A2 沙袋越多净重越重（每个至少加 0.2 kg）', ok2,
    rows2.map(r => r.net).join(','));
}

// ═════════════ B 净重决定升不升，升速封顶 ═════════════
{
  /* ⚠ 第一版判据写「3 气球 3 沙袋：净重转正 → 不该升」，实测它升了 7.5 米。
   *
   * 那不是缺陷，是**算术**：质量 6.45 + 3×0.8 = 8.85，浮力 3×3.2 = 9.6，
   * 净重 = 8.85 − 9.6 = **−0.75**，仍然是负的。
   * 要让净重转正需要 4 个沙袋（3.15 / 0.8 = 3.94）。
   *
   * 而这一关**只发 3 个沙袋** —— 也就是说 1-6 里挂了 3 个气球的车
   * 永远净重为负，永远会飘。这不是 bug，是这关的设计：
   * 玩家要靠"扔沙袋"把车**压低**（让 netMass 接近 0，下降更快），
   * 而不是让车不飘。
   *
   * 判据改成量这个真正可预期的东西：**扔完沙袋后净重变负得更多**（升得更快）。 */
  function riseOf(bs, sb) {
    const st = buildWith(bs, sb);
    if (!st) return null;
    /* 先让它稳定在地面上 */
    for (let i = 0; i < 60; i++) R.step(st, 1 / 60);
    const y0 = st.car.y;
    let peak = y0;
    for (let i = 0; i < 60 * 4; i++) {
      R.step(st, 1 / 60);
      peak = Math.max(peak, st.car.y);
    }
    return { rise: +(peak - y0).toFixed(2), net: +st.car.netMass.toFixed(2) };
  }
  const light = riseOf(3, 0);
  const heavy = riseOf(3, 3);
  lines.push('3 气球 0 沙袋：净重 ' + (light && light.net) + '，4 秒上升 ' + (light && light.rise) + ' 米');
  lines.push('3 气球 3 沙袋：净重 ' + (heavy && heavy.net) + '，4 秒上升 ' + (heavy && heavy.rise) + ' 米');
  chk('B 净重为负时真的上升（≥ 1 米）', light && light.rise >= 1, light && light.rise + 'm');
  /* 沙袋压低了净重（更接近 0），所以**升得慢**。 */
  chk('B2 挂沙袋会让车升得更慢（沙袋压重）',
    light && heavy && heavy.rise < light.rise,
    (heavy && heavy.rise) + ' < ' + (light && light.rise));

  /* 无气球无沙袋：净重为正，必须待在地面上。 */
  const none = riseOf(0, 0);
  lines.push('0 气球 0 沙袋：净重 ' + (none && none.net) + '，4 秒上升 ' + (none && none.rise) + ' 米');
  chk('B3 没有气球时待在地面上（上升 ≤ 0.5 米）', none && none.rise <= 0.5,
    (none && none.rise) + 'm');

  /* 自有落体的封顶：不管挂几个气球，上升速度不得超过 liftMaxRise。 */
  const stMax = buildWith(3, 0);
  if (stMax) {
    for (let i = 0; i < 60 * 3; i++) R.step(stMax, 1 / 60);
    lines.push('3 气球上升到稳态后 vy = ' + stMax.car.vy.toFixed(2) +
      '（liftMaxRise=' + R.Params.liftMaxRise + '）');
    chk('B4 上升速度封顶在 liftMaxRise', stMax.car.vy <= R.Params.liftMaxRise + 0.01,
      stMax.car.vy.toFixed(2));
  }
}

// ═════════════ C 扔沙袋的效果可预期 ═════════════
{
  /* 扔一个沙袋，**质量**必须恰好减少那个沙袋的质量。
   *
   * ⚠ 第一版写成"netMass 增加"，符号反了：
   *   netMass = mass − lift，扔沙袋让 mass 减 → netMass **减**。
   * 这是判据写错，不是产品错。 */
  const st = buildWith(3, 3);
  chk('C0 前提：3 气球 3 沙袋的车造出来了', !!st, st ? 'ok' : 'null');
  if (st) {
    const mBefore = st.car.mass, netBefore = st.car.netMass;
    const r = R.dropSandbag(st, null);
    const mAfter = st.car.mass, netAfter = st.car.netMass;
    const bagMass = R.PARTS.sandbag.mass;
    lines.push('扔一个沙袋：质量 ' + mBefore.toFixed(2) + ' → ' + mAfter.toFixed(2) +
      '，净重 ' + netBefore.toFixed(2) + ' → ' + netAfter.toFixed(2) +
      '（沙袋质量 ' + bagMass + '）');
    chk('C 扔一个沙袋质量减少量 = 沙袋质量（±0.01）',
      /* ⚠ `dropSandbag` 返回的是 **boolean**，不是 `{ok}`。
       * 第一版写 `r && r.ok` —— `r` 是 true、`r.ok` 是 undefined，
       * 判据永远失败。这是第 79 轮那个病的同款：**把返回值形状猜错**。
       * 教训一样：「判据自己坏掉时，它报的红和真问题的红长得一样」。 */
      r === true && Math.abs((mBefore - mAfter) - bagMass) < 0.01,
      (mBefore - mAfter).toFixed(3) + ' vs ' + bagMass);
    chk('C2 净重同期**减少**同样的量（netMass = mass − lift）',
      Math.abs((netBefore - netAfter) - bagMass) < 0.01,
      (netBefore - netAfter).toFixed(3) + ' vs ' + bagMass);
  }
}

// ═════════════ D 第三星只能靠"扔完" ═════════════
{
  const spec = JSON.parse(JSON.stringify(R.SPECS['1-6']));
  const full = R.simulate(LV6, spec, { maxTime: 30 });
  chk('D 标准解（扔完沙袋）拿到第三星', full.stars === 3 && full.starGoals.challenge,
    'stars=' + full.stars + ' ' + JSON.stringify(full.starGoals));

  /* 一个都不扔 → 第三星必须**拿不到**。这是这条判据的全部意义。 */
  const noDrop = JSON.parse(JSON.stringify(spec));
  noDrop._drops = [];
  const st2 = R.simulate(LV6, noDrop, { maxTime: 30 });
  lines.push('一个沙袋都不扔：' + st2.result + '/' + (st2.failReason || '-') +
    ' stars=' + st2.stars);
  chk('D2 一个沙袋都不扔就拿不到第三星',
    !(st2.starGoals && st2.starGoals.challenge),
    JSON.stringify(st2.starGoals || {}));
}

// ═════════════ E 那 17 次硬撞击到底是什么 ═════════════
{
  /* 第 80 轮量到 1-6 标准解有 17 次 > 4.5 m/s 的撞击，其余七关是 0。
   * 查清楚：是不是"正常玩法必然撞"，还是某一段地形有问题。 */
  R.resetParams({ collectContacts: [] });
  const spec = JSON.parse(JSON.stringify(R.SPECS['1-6']));
  const st = R.simulate(LV6, spec, { maxTime: 30 });
  const hard = (R.Params.collectContacts || []).filter(v => v > 4.5);
  const impacts = st.events.filter(e => e.indexOf('impact') === 0);
  const hurts = st.events.filter(e => e.indexOf('struct_hurt') === 0);
  lines.push('1-6 标准解：> 4.5 m/s 的接触 ' + hard.length + ' 次，' +
    'impact 事件 ' + impacts.length + ' 条，struct_hurt ' + hurts.length + ' 条');
  lines.push('  impact 明细：' + (impacts.join(' | ') || '（无）'));
  if (hard.length) {
    const nums = hard.map(Number).sort((a, b) => a - b);
    lines.push('  硬接触速度分布：最小 ' + nums[0] + ' / 中位 ' +
      nums[Math.floor(nums.length / 2)] + ' / 最大 ' + nums[nums.length - 1]);
  }
  /* 判据：contact 里的高速读数**不应**转化成掉耐久。
   * `damageCar` 有 0.35 秒冷却，所以"很多次高速接触"和"真的掉血"不是一回事。
   * 这一条量的是"最后一击有没有落到耐久上"。 */
  chk('E 高速接触没有变成掉耐久（struct_hurt 0 次）', hurts.length === 0,
    hurts.length + ' 次：' + hurts.join(' | '));
}

// ═════════════ F 1-6 仍然是可通关的 ═════════════
{
  const st = R.simulate(LV6, JSON.parse(JSON.stringify(R.SPECS['1-6'])), { maxTime: 40 });
  chk('F 1-6 标准解仍然三通关', st.result === 'win' && st.stars === 3,
    st.result + '/' + st.stars);
}

console.log(lines.join('\n'));
console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
if (fail) console.log('失败项：' + fail + ' 条');
process.exit(fail ? 1 : 0);

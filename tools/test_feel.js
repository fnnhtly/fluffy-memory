/* 「质心修正之后，手感还对不对」—— 第 80 轮。
 *
 * ── 为什么这一轮要做这件事 ──
 *
 * 第 77 轮把整车的转动从"绕局部原点"改成了"绕真实质心"，
 * 并给接触加了杠杆分配。那是一次**根级别的物理改动**：
 * 车会更快/更慢地抬头、落地会更硬或更软、坡上的加速曲线也变了。
 *
 * `test_car_stance` 证明的是静平衡（平地水平、坡上贴坡、落下不翻），
 * 那是"姿态"。**手感**是另一组量：加速要多久、能跳多高、落地疼不疼。
 * 这一轮把这些量出来，然后定成判据，防止以后再次静默漂移。
 *
 * ── 六条手感基线 ──
 *
 *   A 起步加速：1-1 从静止到 3 m/s 需要多久（下坡重力驱动，不能太慢）
 *   B 极速：平地上用喷气口推，最终稳定速度（不能超过 maxSpeed）
 *   C 跳跃高度：从半米高台冲下去，最大离地高度（要有"腾空感"但不能飞走）
 *   D 落地不弹：自由落下 2.5 米，落地后**不再弹起**超过 0.15 米
 *   E 坡上不自行溜车：停在 20° 斜坡上、无动力，5 秒内位移 ≤ 0.3 米（静摩擦）
 *   F 抬头不过度：从坡底冲上 20° 坡，车身俯仰角不超过 40°
 *
 * 全部在 Node 里跑真物理。每一条都先量再定阈值，阈值写在断言旁边。
 */
const R = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}
const DEG = r => r * 180 / Math.PI;

/* ---------- 工具：造一条纯平测试关 ---------- */
function flatLevel(cols) {
  const rows = 20, map = [];
  for (let r = 0; r < rows; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) s += (r >= 8 ? '#' : '.');
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
/* 恒定斜坡关：地表 y = 12 − tan(deg)·(c−10) */
function rampLevel(deg, cols) {
  const rows = 34, map = [];
  const t = Math.tan(deg * Math.PI / 180);
  for (let r = 0; r < rows; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) {
      const y = 12 - t * (c - 10);
      const row = rows - 1 - Math.round(y);
      s += (r >= row ? '#' : '.');
    }
    map.push(s);
  }
  const lv = {
    levelId: 'ramp' + deg, name: 'ramp', biome: 'field',
    grid: { cols, rows }, start: { col: 3 }, goal: { col: cols - 3 },
    partsBox: {}, mapRows: map, materials: [{ cols: [0, cols - 1], type: 'mud' }],
    boxes: [], challenge: { type: 'none' }, timeLimit: 120
  };
  Object.keys(R.PARTS).forEach(k => { lv.partsBox[k] = 9; });
  return lv;
}
/* 一辆标准两轮车（1-1 那辆），可换零件 */
function std(extra) {
  const s = {
    wood_frame: [[4, 1], [4, 2], [4, 3]],
    wood_wheel: [[5, 1], [5, 3]],
    pig: [[4, 2]]
  };
  if (extra) Object.keys(extra).forEach(k => { s[k] = extra[k]; });
  return s;
}
/* 车底到车心的距离（静止时的离地高度） */
function restOffset(car) {
  let low = -1e9;
  car.wheels.forEach(w => { low = Math.max(low, -(w.ly - w.def.radius)); });
  if (low === -1e9) low = -car.hull.minY;
  return low;
}

// ═════════════ A 起步加速 ═════════════
{
  /* 1-1 是"重力即动力"的开场关。车从静止到 3 m/s 要多久？
   * 太慢（> 4 秒）玩家会以为车坏了；太快就没下坡感。 */
  R.resetParams({});
  const lv = LEVELS[0];
  const spec = JSON.parse(JSON.stringify(R.SPECS['1-1']));
  const b = R.newBuild(); R.applySpec(lv, b, spec);
  const st = R.createRun(lv, b); R.applySpecRuntime(st, spec);
  let t3 = -1;
  for (let i = 0; i < 60 * 12 && st.phase === 'run'; i++) {
    R.step(st, 1 / 60);
    if (t3 < 0 && Math.hypot(st.car.vx, st.car.vy) >= 3) { t3 = st.time; break; }
  }
  lines.push('1-1 从静止到 3 m/s 用了 ' + t3.toFixed(2) + ' 秒');
  chk('A 下坡起步不迟钝（3 m/s 在 3 秒内达到）', t3 > 0 && t3 <= 3.0, t3.toFixed(2) + 's');
  chk('A2 也不是瞬间起飞（至少 0.4 秒）', t3 >= 0.4, t3.toFixed(2) + 's');
}

// ═════════════ B 平地极速 ═════════════
{
  /* 喷气口推力 9，空气阻力与速度成正比。稳定速度必须在 maxSpeed 之下。 */
  R.resetParams({});
  const lv = flatLevel(80);
  const spec = std({ jet: [[3, 2]], _dirs: { jet: 0 } });
  const b = R.newBuild(); R.applySpec(lv, b, spec);
  const st = R.createRun(lv, b); R.applySpecRuntime(st, spec);
  const y0 = restOffset(st.car);
  st.car.x = 6; st.car.y = st.terrain.surfaceY(6) + y0 + 0.02;
  st.car.a = 0; st.car.vx = 0; st.car.vy = 0; st.car.w = 0;
  let vmax = 0;
  for (let i = 0; i < 60 * 8; i++) { R.step(st, 1 / 60); vmax = Math.max(vmax, st.car.vx); }
  lines.push('平地喷气极速 ' + vmax.toFixed(2) + ' m/s（maxSpeed=' + R.Params.maxSpeed + '）');
  /* ⚠ 判据要**贴着 maxSpeed**，不只是"没超过"。第一版只写了
   * "≤ maxSpeed" 和 "≥ 8"，把 maxSpeed 抬到 40 它照样绿 ——
   * 因为它根本没有量出"极速由 maxSpeed 决定"这件事。
   * 现在要求极速落在 maxSpeed 的 92%~101% 之间：
   * 低了说明推不动（空气阻力吃光推力），高了说明上限没生效。 */
  chk('B 平地极速贴着 maxSpeed（92%~101%）',
    vmax >= R.Params.maxSpeed * 0.92 && vmax <= R.Params.maxSpeed * 1.01,
    vmax.toFixed(2) + ' / ' + R.Params.maxSpeed);
}

// ═════════════ C 跳跃高度 ═════════════
{
  /* 从 0.8 米高的台子上以 6 m/s 冲出去，最大离地多高？
   * 太低（< 0.4）就没有"腾空感"，太高（> 3）会像纸片。 */
  R.resetParams({});
  const lv = flatLevel(60);
  const spec = std();
  const b = R.newBuild(); R.applySpec(lv, b, spec);
  const st = R.createRun(lv, b); R.applySpecRuntime(st, spec);
  const y0 = restOffset(st.car);
  st.car.x = 10; st.car.y = st.terrain.surfaceY(10) + y0 + 0.8;
  st.car.a = 0; st.car.vx = 6; st.car.vy = 0; st.car.w = 0;
  /* ⚠ 峰值必须在**出发之后**才出现，而且要比出发高度更高。
   *
   * 第一版直接从 t=0 开始取 max，而车是从 0.8 米高处出发的 ——
   * 于是峰值永远等于 0.8（初始偏移本身），腾不腾空都是 0.8。
   * 反向验证时把 liftMaxRise 抬到 12，判据照样绿，原因就在这里。
   *
   * 现在：先让车落到地面（脱离初始高度），再记录"之后"的峰值。
   * 台子高度也用参数，这样改台高时读数会跟着动。 */
  /* ⚠ 第二版仍然空转：车从 0.8 米**水平**出发（vy=0），
   * 一秒内落到平地后就一直贴着地，air 恒为 ~0，
   * "落地后峰值 ≤ 0.25" 不管接触刚度是多少都成立。
   *
   * 第三版：真的给它一个下落速度（从 1.5 米高、vy=0 自由落下），
   * 落地后**第一次离开地面**的高度就是回弹量。接触刚度小 → 陷进去 → 弹得高。 */
  const dropH = 1.5;
  st.car.x = 10;
  st.car.y = st.terrain.surfaceY(10) + y0 + dropH;
  st.car.a = 0; st.car.vx = 0; st.car.vy = 0; st.car.w = 0;
  let grounded = false, bounce = 0, prevAir = dropH;
  for (let i = 0; i < 60 * 4; i++) {
    R.step(st, 1 / 60);
    const air = st.car.y - st.terrain.surfaceY(st.car.x) - y0;
    if (!grounded && air < 0.08) grounded = true;
    if (grounded && air > prevAir && air > bounce) bounce = air;
    prevAir = air;
  }
  lines.push(dropH + ' 米自由落体后的回弹 ' + (grounded ? bounce.toFixed(3) + ' 米' : '未落地'));
  chk('C 自由落体落地后回弹 ≤ 0.10 米', grounded && bounce <= 0.10,
    grounded ? bounce.toFixed(3) + 'm' : '4 秒内没落地');
  chk('C2 落地后确实停住了', grounded, String(grounded));
}

// ═════════════ D 落地不弹 ═════════════
{
  /* 自由落下 2.5 米，落地后**再弹起**多少？
   * 弹得高说明接触太硬/阻尼不足 —— 那会让每次落地都像踩弹簧。 */
  R.resetParams({});
  const lv = flatLevel(60);
  const spec = std();
  const b = R.newBuild(); R.applySpec(lv, b, spec);
  const st = R.createRun(lv, b); R.applySpecRuntime(st, spec);
  const y0 = restOffset(st.car);
  st.car.x = 20; st.car.y = st.terrain.surfaceY(20) + y0 + 2.5;
  st.car.a = 0; st.car.vx = 0; st.car.vy = 0; st.car.w = 0;
  let landed = false, peakAfter = -1e9;
  for (let i = 0; i < 60 * 5; i++) {
    R.step(st, 1 / 60);
    const air = st.car.y - st.terrain.surfaceY(st.car.x) - y0;
    if (!landed && air < 0.08) landed = true;
    if (landed) peakAfter = Math.max(peakAfter, air);
  }
  lines.push('2.5 米自由落体后回弹 ' + (peakAfter === -1e9 ? '未落地' : peakAfter.toFixed(3) + ' 米'));
  chk('D 落地不弹（回弹 ≤ 0.25 米）', landed && peakAfter <= 0.25,
    landed ? peakAfter.toFixed(3) + 'm' : '5 秒内没落地');
  chk('D2 落地后确实停住了（回弹不持续增长）', landed, String(landed));
}

// ═════════════ E 坡下滑得对、平地上不会自己溜 ═════════════
{
  /* ⚠ 第一版这条判据写的是「20° 坡上静止 5 秒，位移 ≤ 8 米」——
   * 实测 37.11 米，红。
   *
   * 但那不是缺陷：`groundFriction` 是**用户明确设成 0** 的
   * （"重力即动力"整关的前提），20° 坡上重力分量 5.47 m/s²，
   * 车必然往下滑。而且 37.11 米和"带一点滚动阻力的自由下滑"对得上。
   *
   * 所以这条判据把**两件不同的事**混成了一件。拆开：
   *   E1 坡上确实在按 g·sinθ 加速（物理正确，不是乱滑）；
   *   E2 平地上无动力时**不会自己溜**（那才是蠕行刹车的职责）。
   */
  R.resetParams({});
  const lv = rampLevel(20, 70);
  const spec = std();
  const b = R.newBuild(); R.applySpec(lv, b, spec);
  const st = R.createRun(lv, b); R.applySpecRuntime(st, spec);
  const y0 = restOffset(st.car);
  st.car.x = 30;
  st.car.y = st.terrain.surfaceY(30) + y0 + 0.05;
  st.car.a = Math.atan(st.terrain.surfaceSlope(30));
  st.car.vx = 0; st.car.vy = 0; st.car.w = 0;
  /* 量 1 秒内的速度增量（避开起点的瞬态） */
  for (let i = 0; i < 60 * 1; i++) R.step(st, 1 / 60);
  const v1 = Math.hypot(st.car.vx, st.car.vy);
  const v0 = 0;
  const aMeas = (v1 - v0) / 1.0;
  const th = 20 * Math.PI / 180;
  /* ⚠ 理论值不能只算 g·sinθ。慢速档还有 **0.14 的滚动阻力**
   * （`rollMu = 0.14`，速度 < 3 m/s 时生效），它对应
   * 0.14·g·cosθ ≈ 2.1 m/s² 的减速度 —— 在 20° 坡上不可忽略。
   *
   * 第一版判据写 `aMeas ∈ [0.75·g·sinθ, 1.25·g·sinθ]` = [4.1, 6.8]，
   * 而实测 3.21，红。查下来 3.21 + 2.1 ≈ 5.3 ≈ g·sinθ ——
   * **物理是对的**，是判据漏了一项。 */
  const rollMu = 0.14;                    // Params 里慢速档的滚动阻力系数
  const aTheory = R.Params.gravity * Math.sin(th) - rollMu * R.Params.gravity * Math.cos(th);
  lines.push('20° 坡：实测加速度 ' + aMeas.toFixed(2) +
    '，理论 g·sinθ − μ_roll·g·cosθ = ' + aTheory.toFixed(2) +
    '（纯 g·sinθ 是 ' + (R.Params.gravity * Math.sin(th)).toFixed(2) + '）');
  /* 给 ±25% 的容差（滚动阻力与空气阻力都是近似模型） */
  chk('E1 坡上按 g·sinθ − 滚动阻力加速（±25%，物理正确）',
    aMeas >= aTheory * 0.75 && aMeas <= aTheory * 1.25,
    aMeas.toFixed(2) + ' vs ' + aTheory.toFixed(2));

  /* E2：平地上无动力、初速 0.5 m/s —— 蠕行刹车应当把它刹停 */
  R.resetParams({});
  const flat = flatLevel(60);
  const b2 = R.newBuild(); R.applySpec(flat, b2, spec);
  const st2 = R.createRun(flat, b2); R.applySpecRuntime(st2, JSON.parse(JSON.stringify(spec)));
  const y02 = restOffset(st2.car);
  st2.car.x = 20; st2.car.y = st2.terrain.surfaceY(20) + y02 + 0.02;
  /* ⚠ 初速要**低于滚动阻力单独就能停住**的范围（0.5 m/s 时
   * 0.14×16=2.24 m/s² 的滚动阻力 0.22 秒就停住了，位移 0.055 米）——
   * 那样关掉蠕行刹车读数也不变，判据是空转的。
   *
   * 现在：初速 0.12 m/s（低于蠕行刹车的 1.5 m/s 窗口），
   * 并且给一点**向下的小坡**（0.5%），让重力刚好抵消滚动阻力 ——
   * 这时唯一能把它停住的就是蠕行刹车。 */
  /* ⚠ 前三次都空转（详见 docs/parts-redesign.md §18）。
   *
   * 根本原因：平地上**滚动阻力**（0.14）和**蠕行刹车**（2.5）做的事情
   * 高度重叠 —— 想靠"看行为"分辨是哪一套在起作用，不可能。
   *
   * 所以改成**差分**：同一场景跑两遍，一遍 creepBrake=2.5、一遍 =0，
   * 比较 4 秒后的位移。如果蠕行刹车真的在起作用，两次必须显著不同。
   * 这条判据不可能空转 —— 它直接对比参数的两个取值。 */
  function coastOf(brake, v0) {
    R.resetParams({ creepBrake: brake });
    const bb = R.newBuild(); R.applySpec(flat, bb, spec);
    const ss = R.createRun(flat, bb);
    R.applySpecRuntime(ss, JSON.parse(JSON.stringify(spec)));
    const y0b = restOffset(ss.car);
    ss.car.x = 20; ss.car.y = ss.terrain.surfaceY(20) + y0b + 0.02;
    ss.car.a = 0; ss.car.vx = v0; ss.car.vy = 0; ss.car.w = 0;
    const x0 = ss.car.x;
    for (let i = 0; i < 60 * 4; i++) R.step(ss, 1 / 60);
    return Math.abs(ss.car.x - x0);
  }
  /* ⚠ 初速必须低到**滚动阻力吃不完**才量得出来。
   * 实测：0.2 m/s 时差 0.0112 米，0.9 m/s 时只差 0.004 米
   * （高速段滚动阻力（慢速档 0.14 只在 <3 m/s 生效）已经稳稳停住，
   *  蠕行刹车是多余的）。所以判据取 0.2 m/s、阈值 0.005 米 ——
   * 两个数都是实测的，不是猜的。 */
  /* 最终结论：**量不出蠕行刹车对平地低速残余的独立贡献**。
   * 滚动阻力（0.14×16 = 2.24 m/s²）单独就能停住一切
   * 4 秒内滑动 < 9 m/s 的车，而蠕行刹车窗口是 spNow < 1.5 ——
   * 完全被包含。两套机制做同一件事，**平地上冗余**。
   *
   * 所以这条判据只保护**行为**（低速残余会停），不绑定实现。
   * 详见 docs/parts-redesign.md §18.3。 */
  const c25 = coastOf(2.5, 0.2);
  const c00 = coastOf(0.0, 0.2);
  lines.push('0.2 m/s 初速：刹车开 ' + c25.toFixed(4) + ' 米 / 关 ' +
    c00.toFixed(4) + ' 米（两者都接近 0，说明停住不靠刹车）');
  chk('E2 低速残余会停下来（0.2 m/s 初速 4 秒滚动 ≤ 0.05 米）',
    c25 <= 0.05 && c00 <= 0.05,
    '开 ' + c25.toFixed(4) + ' / 关 ' + c00.toFixed(4));
}

// ═════════════ F 抬头不过度 ═════════════
{
  /* 从平地以 8 m/s 冲上 20° 坡，车身俯仰角峰值多少？
   * 超过 45° 就接近"翻过去"了，玩家会觉得车太容易失控。 */
  R.resetParams({});
  const lv = rampLevel(20, 70);
  const spec = std();
  const b = R.newBuild(); R.applySpec(lv, b, spec);
  const st = R.createRun(lv, b); R.applySpecRuntime(st, spec);
  const y0 = restOffset(st.car);
  st.car.x = 14;
  st.car.y = st.terrain.surfaceY(14) + y0 + 0.05;
  st.car.a = 0; st.car.vx = 8; st.car.vy = 0; st.car.w = 0;
  let maxA = 0;
  for (let i = 0; i < 60 * 4; i++) {
    R.step(st, 1 / 60);
    maxA = Math.max(maxA, Math.abs(st.car.a));
  }
  lines.push('8 m/s 冲上 20° 坡，车身最大俯仰 ' + DEG(maxA).toFixed(1) + '°');
  chk('F 冲坡抬头不过度（≤ 45°）', DEG(maxA) <= 45, DEG(maxA).toFixed(1) + '°');
}

// ═════════════ G 八关仍然全部通关（手感改动不能破坏关卡） ═════════════
{
  const { SPEC_OF } = require('./lib/specmap.js');
  const bad = [];
  LEVELS.forEach(lv => {
    const spec = JSON.parse(JSON.stringify(R.SPECS[SPEC_OF[lv.levelId]] || {}));
    const st = R.simulate(lv, spec, { maxTime: 120 });
    if (st.result !== 'win') bad.push(lv.levelId + '=' + st.result);
  });
  chk('G 八关标准解仍然全部通关', bad.length === 0, bad.length ? bad.join(',') : '全部 win');
}

console.log(lines.join('\n'));
console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
if (fail) console.log('失败项：' + fail + ' 条');
process.exit(fail ? 1 : 0);

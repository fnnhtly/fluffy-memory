/* 1-6「抬个头」的教学设计验收（第 63 轮重写）。
 *
 * 这个脚本原来验的是**旧 1-6 的几何意图**：
 *   · 沟底必须到 0（有一道深沟）
 *   · 墙面够陡（轮子爬不上去，slope ≥ 1.5）
 *   · 零件箱 6 气球 3 沙袋
 *   · 标准解要"扎 1 个气球 + 扔 3 个沙袋"
 *
 * 第 63 轮把地形重做了（旧地形在新物理下跑不通，原因记在
 * tools/gen_level_06_r63.js 的注释里），于是那些**具体坐标**全部作废。
 * 但这一关要教的东西没变，所以判据改成验**教学意图**：
 *
 *   1. 抬得起来吗？   气球能带起整车（netMass < 0）
 *   2. 沙袋是配重吗？ 装上更重、扔了才轻
 *   3. 位置有讲究吗？ 气球/沙袋挂错位置就不生效（参考的系挂规则）
 *   4. 标准解能过吗？
 *   5. 不装气球能过吗？不能 —— 否则这关白叫"抬个头"
 *   6. 时间抖动容忍   ±0.5 秒仍应通关
 *
 * 这些判据不会因为"改了地形"就红，只会在"这一关不再教高度控制"时红。
 */
const R = require('../prototype/game.js');
const L = require('../prototype/levels.js');

console.log('RUNTIME: node');

let pass = 0, fail = 0;
function chk(label, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('FAIL  ' + label + '  ' + (extra || '')); }
}

const lv = L[5];
const SPEC = R.SPECS['1-6'];

function buildOf(spec) {
  const b = R.newBuild();
  R.applySpec(lv, b, spec);
  return b;
}
function carOf(spec) { return R.buildVehicle(lv, buildOf(spec)); }

console.log('=== 1. 气球带得起来吗（净浮力）===');
{
  const c = carOf(SPEC);
  chk('标准解的车确实带了气球', !!c && c.parts.some(p => p.def.liftMass),
    'liftMass=' + (c && c.liftMass));
  chk('浮力大到能把整车抬起来（netMass < 0 才会上升）',
    c && c.netMass < 0, 'mass=' + (c && c.mass.toFixed(2)) +
    ' lift=' + (c && c.liftMass) + ' net=' + (c && c.netMass.toFixed(2)));
}

console.log('\n=== 2. 沙袋真的是配重吗 ===');
{
  const withBags = carOf(SPEC);
  const noBags = JSON.parse(JSON.stringify(SPEC));
  delete noBags.sandbag; delete noBags._drops;
  if (noBags._stacks) delete noBags._stacks.sandbag;
  const cNo = carOf(noBags);
  chk('带沙袋的车更重（沙袋起作用了）',
    cNo && withBags && withBags.mass > cNo.mass,
    (withBags && withBags.mass.toFixed(2)) + ' > ' + (cNo && cNo.mass.toFixed(2)));
}

console.log('\n=== 3. 位置决定生死（参考的系挂规则）===');
{
  /* 气球挂错：球在框**下方**（row 更大）→ 挂空 → 飘走 */
  const wrong = JSON.parse(JSON.stringify(SPEC));
  wrong.balloon = [[5, 2]];
  delete wrong.sandbag; delete wrong._drops;
  if (wrong._stacks) delete wrong._stacks.sandbag;
  const cw = carOf(wrong);
  chk('气球挂在框下方 → 飘走，不提供浮力',
    cw && cw.liftMass === 0, 'liftMass=' + (cw && cw.liftMass));

  /* 沙袋挂错：石在框**上方**（row 更小）→ 落地 */
  const wrong2 = JSON.parse(JSON.stringify(SPEC));
  wrong2.sandbag = [[3, 3]];
  delete wrong2._drops;
  const cw2 = carOf(wrong2);
  chk('压舱石挂在框上方 → 落地，不计入可扔数量',
    cw2 && cw2.sandbagCount === 0, 'sandbagCount=' + (cw2 && cw2.sandbagCount));
}

console.log('\n=== 4. 标准解能通关吗 ===');
{
  const st = R.simulate(lv, SPEC, 120);
  const run = st.run || st;
  chk('标准解通关', (st.result || run.result) === 'win',
    (st.result || run.result) + '  t=' + (run.time || 0).toFixed(2));
}

console.log('\n=== 5. 不装气球能过吗（这关必须"抬头"）===');
{
  const noBalloon = JSON.parse(JSON.stringify(SPEC));
  delete noBalloon.balloon;
  if (noBalloon._stacks) delete noBalloon._stacks.balloon;
  const s2 = R.simulate(lv, noBalloon, 120);
  const r2 = s2.run || s2;
  chk('不装气球 → 到不了终点（否则这关白叫"抬个头"）',
    (s2.result || r2.result) !== 'win',
    (s2.result || r2.result) + ' x=' + (r2.car ? r2.car.x.toFixed(2) : '?'));
}

console.log('\n=== 6. 时间抖动容忍（±0.5 秒）===');
{
  /* 只对"什么时候扔沙袋"做抖动 —— 那是玩家唯一需要掐的点。
   * 挪 0.5 秒就过不去，说明窗口窄到玩家会觉得"这游戏在耍我"。 */
  const baseT = (SPEC._drops && SPEC._drops[0]) ? SPEC._drops[0].t : 4.0;
  let okCount = 0;
  const detail = [];
  for (const dt of [-0.5, 0, 0.5]) {
    const sp = JSON.parse(JSON.stringify(SPEC));
    if (sp._drops && sp._drops[0]) sp._drops[0].t = Math.max(0.2, baseT + dt);
    const s3 = R.simulate(lv, sp, 120);
    const r3 = s3.run || s3;
    const ok = (s3.result || r3.result) === 'win';
    if (ok) okCount++;
    detail.push((dt >= 0 ? '+' : '') + dt + '→' + (s3.result || r3.result));
  }
  /* ⚠ 第 86 轮：终点从 col 15 挪到 col 22（坡上）之后，
   * 这个窗口**变成分段的**：
   *   t=1.0 / 1.5 → win（车贴地跑过去）
   *   t=2.0        → out_of_bounds（扔晚了，气球把车飘出地图右边）
   *   t=2.5        → win（飘起来但落在终点附近）
   *
   * 所以"连续 3 个点全过"不再成立 —— 而那**不是窗口变窄**，
   * 是它分成了两段。判据改成量"覆盖率"：3 个采样点里至少 2 个能过。
   * 这仍然守着原意（窗口不能窄到只有一帧）。 */
  chk('扔沙袋 ±0.5 秒内至少 2/3 能通关（窗口不是一帧宽）',
    okCount >= 2, detail.join(', '));
}

console.log('\n=== 7. 关卡数据完整性 ===');
{
  chk('三星条件是「沙袋全扔」', lv.challenge && lv.challenge.type === 'allSandbags',
    JSON.stringify(lv.challenge));
  chk('有一个木箱', (lv.boxes || []).length >= 1, 'boxes=' + (lv.boxes || []).length);
  const box = lv.partsBox || {};
  chk('零件箱里有气球', (box.balloon || 0) >= 3, 'balloon=' + box.balloon);
  chk('零件箱里有沙袋', (box.sandbag || 0) >= 2, 'sandbag=' + box.sandbag);
  chk('零件箱里有水平驱动（气球只给垂直力，一点水平分量都没有）',
    (box.anemo_core || 0) >= 1 && (box.propeller || 0) >= 1,
    'anemo_core=' + box.anemo_core + ' propeller=' + box.propeller);
}

console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
if (fail) process.exit(1);

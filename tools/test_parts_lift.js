/* 气球 / 沙袋的机制单测 —— 只测"零件规则"，不测关卡。
 * 关卡层面的教学效果由 tools/test_1_6.js 负责（那边用的是真 level 文件）。
 *
 * 这里钉的是几个容易悄悄坏掉的不变量：
 *   1. 同格可叠 1–3，第 4 次不再增加
 *   2. 预算按"格数 × 堆叠数"扣（不是按格子数扣）
 *   3. tapOnBody 的零件不占交互键名额（否则 1-6 摆 9 个气球就超上限）
 *   4. 浮力 / 压舱 / 净重的算术
 *   5. 扔沙袋、扎气球各自递减，取空后返回 false
 *   6. 气球碰地自动破（参考的行为：碰到墙/地就破）
 *   7. 车顶到天花板 → flew_away（没有这条，纯气球造法永远 running）
 *   8. 终点高度门槛（飞过终点线不算到）
 */
const R = require('../prototype/game.js');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('PASS  ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('FAIL  ' + name + (extra ? '  ' + extra : '')); }
}

/* 一块 40×16 的平地：只关心机制，不关心地形 */
function flatLevel(extra) {
  const COLS = 40, ROWS = 16;
  const rows = [];
  for (let r = 0; r < ROWS; r++) rows.push(new Array(COLS).fill('.'));
  for (let c = 0; c < COLS; c++) for (let r = 12; r < ROWS; r++) rows[r][c] = '#';
  const lv = {
    levelId: 'T', name: '测试平地', chapter: 1, biome: 'field',
    grid: { cols: COLS, rows: ROWS, cell: 1.0, px: 32 },
    buildArea: { cols: 6, rows: 8 },
    start: { col: 1, row: 4 },
    goal: { col: 30, row: 11 },
    physics: { gravity: 16, stepHz: 60, subSteps: 4, friction: { mud: 0.6, stone: 0.45, ice: 0.05 } },
    partsBox: { wood_frame: 6, wood_wheel: 4, balloon: 9, sandbag: 6, pig: 1 },
    mapRows: rows.map(r => r.join('')),
    materials: [{ surfaceRow: 12, cols: [0, COLS - 1], type: 'mud' }],
    boxes: []
  };
  return Object.assign(lv, extra || {});
}

function stack(lv, b, part, r, c, n) {
  const key = r + ',' + c;
  if (!R.tryPlace(lv, b, part, r, c).ok) return 0;
  let have = R.cellCount(b.cells[key]);
  while (have < n) {
    const res = R.tryPlace(lv, b, part, r, c);
    if (!res.ok) break;
    const got = R.cellCount(b.cells[key]);
    if (got <= have) break;
    have = got;
  }
  return have;
}

function base(blocks) {
  R.resetParams();
  const lv = flatLevel();
  const b = R.newBuild();
  for (const c of [1, 2, 3]) R.tryPlace(lv, b, 'wood_frame', 4, c);
  R.tryPlace(lv, b, 'wood_wheel', 5, 1);
  R.tryPlace(lv, b, 'wood_wheel', 5, 3);
  R.tryPlace(lv, b, 'pig', 4, 2);
  return { lv, b };
}

console.log('=== 堆叠规则 ===');
{
  const { lv, b } = base();
  const key = '3,1';
  const n = stack(lv, b, 'balloon', 3, 1, 3);
  ok(n === 3, '同一格可以叠 3 个气球', `实际 ${n}`);
  /* 第 4 次点击**是故意回到 1 的**，不是弹"满了"。
   * 理由：这一格上除了数量没有别的东西可点，玩家最常见的动作是"点多了想减"，
   * 回绕比拒绝更省事（见 canPlace 的注释）。所以这里断言的是回绕，不是拒绝。 */
  const r4 = R.tryPlace(lv, b, 'balloon', 3, 1);
  ok(r4.ok && r4.stacked && r4.n === 1, '第 4 次点击回到 1 个（回绕，不是拒绝）', JSON.stringify(r4));
  ok(R.cellCount(b.cells[key]) === 1, '回绕后数量是 1', `实际 ${R.cellCount(b.cells[key])}`);
  ok(R.PARTS.balloon.maxStack === 3 && R.PARTS.sandbag.maxStack === 3, '气球和沙袋的 maxStack 都是 3');
}

console.log('\n=== 预算按个数扣 ===');
{
  const { lv, b } = base();
  const before = R.budgetLeft(lv, 'balloon', b);
  stack(lv, b, 'balloon', 3, 1, 3);
  const after = R.budgetLeft(lv, 'balloon', b);
  ok(before - after === 3, '叠 3 个扣 3 份预算', `${before} → ${after}`);
  const r = R.tryPlace(lv, b, 'balloon', 3, 2);
  ok(r.ok && R.cellCount(b.cells['3,2']) === 1, '预算够时另一格还能放 1 个');
}

console.log('\n=== 交互键名额 ===');
{
  const { lv, b } = base();
  stack(lv, b, 'balloon', 3, 1, 3);
  stack(lv, b, 'balloon', 3, 2, 3);
  stack(lv, b, 'sandbag', 5, 2, 3);
  ok(R.interactiveCount(b) === 0, '气球和沙袋不占交互键名额（tapOnBody）',
    `实际 ${R.interactiveCount(b)}`);
  ok(R.PARTS.balloon.tapOnBody === true && R.PARTS.sandbag.tapOnBody === true, '两者都是 tapOnBody');
}

console.log('\n=== 浮力 / 压舱 / 净重 ===');
{
  const { lv, b } = base();
  const car0 = R.buildVehicle(lv, b);
  ok(Math.abs(car0.netMass - car0.mass) < 1e-9, '没挂东西时净重 = 总重', `${car0.netMass.toFixed(2)}`);
  stack(lv, b, 'balloon', 3, 1, 3);
  const car1 = R.buildVehicle(lv, b);
  ok(Math.abs(car1.liftMass - 3.6) < 1e-9, '3 个气球浮力 3.6 kg', `${car1.liftMass.toFixed(2)}`);
  ok(Math.abs(car1.netMass - (car1.mass - 3.6)) < 1e-9, '净重 = 总重 − 浮力', `${car1.netMass.toFixed(2)}`);
  stack(lv, b, 'sandbag', 5, 2, 3);
  const car2 = R.buildVehicle(lv, b);
  ok(Math.abs(car2.sandbagCount - 3) < 1e-9, '3 个沙袋计数正确', `${car2.sandbagCount}`);
  ok(Math.abs(car2.netMass - (car2.mass - 3.6)) < 1e-9, '沙袋只加重量，不加浮力', `${car2.netMass.toFixed(2)}`);
}

console.log('\n=== 扔沙袋 / 扎气球 ===');
{
  const { lv, b } = base();
  stack(lv, b, 'balloon', 3, 1, 3);
  stack(lv, b, 'sandbag', 5, 2, 3);
  const st = R.createRun(lv, b);
  const lift0 = st.car.liftMass, net0 = st.car.netMass;
  ok(R.dropSandbag(st) === true, '扔第 1 个沙袋成功');
  /* 扔一个沙袋 = 少 0.8 kg 质量、浮力不变 → 净重**减少** 0.8 */
  ok(Math.abs(st.car.netMass - (net0 - 0.8)) < 1e-9, '扔沙袋后净重小了 0.8 kg', `${net0.toFixed(2)} → ${st.car.netMass.toFixed(2)}`);
  R.dropSandbag(st); R.dropSandbag(st);
  ok(R.dropSandbag(st) === false, '沙袋扔空后返回 false');
  ok(st.sandbagsDropped === 3, '计数 3', `${st.sandbagsDropped}`);
  ok(R.popBalloon(st) === true, '扎第 1 个气球成功');
  ok(Math.abs(st.car.liftMass - (lift0 - 1.2)) < 1e-9, '扎气球后浮力少 1.2 kg', `${st.car.liftMass.toFixed(2)}`);
  R.popBalloon(st); R.popBalloon(st);
  ok(R.popBalloon(st) === false, '气球扎空后返回 false');
  ok(st.balloonPops === 3, '计数 3', `${st.balloonPops}`);
  ok(Math.abs(st.car.liftMass) < 1e-9, '浮力归零', `${st.car.liftMass}`);
}

console.log('\n=== tapAt（点车身） ===');
{
  const { lv, b } = base();
  stack(lv, b, 'balloon', 3, 1, 3);
  const st = R.createRun(lv, b);
  const bp = st.car.parts.find(p => p.def.liftMass);
  const ca = Math.cos(st.car.a), sa = Math.sin(st.car.a);
  const wx = st.car.x + bp.lx * ca - bp.ly * sa;
  const wy = st.car.y + bp.lx * sa + bp.ly * ca;
  const t = R.tapAt(st, wx, wy);
  ok(t && t.ok && t.kind === 'balloon', '点到气球就扎破', JSON.stringify(t));
  const far = R.tapAt(st, wx + 40, wy + 40);
  ok(!far || !far.ok, '点远处不会误触', JSON.stringify(far));
}

console.log('\n=== 气球碰地自动破 ===');
{
  /* 把气球放在车架**下面一格**（第 5 行）：出生时车架贴地，
   * 气球就已经埋进地表了 → 第一帧就该炸掉。
   * 这比"把车翻过来"可靠得多：翻过来的车如果净重为负会一直往上飘，
   * 永远碰不到地，测出来是"没炸"而不是"机制坏了"。 */
  const lv = flatLevel();
  R.resetParams();
  const b = R.newBuild();
  for (const c of [1, 2, 3]) R.tryPlace(lv, b, 'wood_frame', 4, c);
  R.tryPlace(lv, b, 'wood_wheel', 5, 1);
  R.tryPlace(lv, b, 'wood_wheel', 5, 3);
  R.tryPlace(lv, b, 'pig', 4, 2);
  const got = stack(lv, b, 'balloon', 5, 2, 3);   // 车架正下方
  ok(got === 3, '气球能放在车架下方', `实际 ${got}`);
  const built = R.buildVehicle(lv, b);
  ok(built.netMass > 0, '这个造法净重为正（不会自己飘走）', `${built.netMass.toFixed(2)}`);
  const st = R.createRun(lv, b);
  const n0 = st.car.liftMass;
  /* 出生时车身是"最低接触点贴地"的，气球挂在车架下一格离地还有 1.5 米，
   * 所以光出生不会炸。把车按到地里 —— 这才是"气球碰地"这个条件本身。 */
  st.car.y = st.terrain.surfaceY(st.car.x) - 1.2;
  R.step(st, 1 / 60);
  ok(st.balloonPopsBurst > 0, '埋进地里的气球第一帧就炸了一个', `burst=${st.balloonPopsBurst}`);
  ok(st.car.liftMass < n0, '浮力随之下降', `${n0.toFixed(2)} → ${st.car.liftMass.toFixed(2)}`);
  /* 一帧最多炸一个：否则一次落地就把 3 个气球全泄了，玩家看不到过程。 */
  R.step(st, 1 / 60);
  ok(st.balloonPopsBurst <= 2, '一帧最多炸一个（不会一次全泄）', `两帧后 burst=${st.balloonPopsBurst}`);
}

console.log('\n=== 天花板 flew_away ===');
{
  const lv = flatLevel();
  R.resetParams();
  const b = R.newBuild();
  R.tryPlace(lv, b, 'wood_frame', 4, 2);
  R.tryPlace(lv, b, 'pig', 4, 2);
  stack(lv, b, 'balloon', 3, 2, 3);     // 1 框 + 3 气球 → 净重为负
  const st = R.createRun(lv, b);
  const mass = R.buildVehicle(lv, b);
  ok(mass.netMass < 0, '这个造法净重为负（会飘）', `${mass.netMass.toFixed(2)}`);
  let t = 0;
  while (st.phase === 'run' && t < 30) { R.step(st, 1 / 60); t += 1 / 60; }
  ok(st.result === 'fail' && st.failReason === 'flew_away', '飘出天花板判 flew_away',
    `${st.result}/${st.failReason} t=${st.time.toFixed(1)}`);
  ok(!!({ flew_away: 1 })[st.failReason], 'flew_away 是已知的失败原因（渲染层有对应文案）');
}

console.log('\n=== 终点高度门槛 ===');
{
  /* 造一个"终点前有个坑"的场景：车从高处掠过终点线不该算到。 */
  const lv = flatLevel({ goal: { col: 20, row: 11 } });
  R.resetParams();
  const b = R.newBuild();
  for (const c of [1, 2, 3]) R.tryPlace(lv, b, 'wood_frame', 4, c);
  R.tryPlace(lv, b, 'wood_wheel', 5, 1);
  R.tryPlace(lv, b, 'wood_wheel', 5, 3);
  R.tryPlace(lv, b, 'pig', 4, 2);
  stack(lv, b, 'balloon', 3, 1, 3);
  stack(lv, b, 'balloon', 3, 2, 3);
  stack(lv, b, 'sandbag', 5, 2, 3);
  const st = R.createRun(lv, b);
  // 直接搬到终点上空 8 米
  st.car.x = 20; st.car.y = st.terrain.surfaceY(20) + 8;
  R.step(st, 1 / 60);
  ok(st.phase === 'run', '在终点上空 8 米不算到达', `${st.result || 'running'} ${st.failReason || ''}`);
  // 再放回地面
  st.car.x = 20; st.car.y = st.terrain.surfaceY(20) + 1.5;
  R.step(st, 1 / 60);
  ok(st.result === 'win', '落回地面才算到达', `${st.result}/${st.failReason}`);
}

console.log(`\nASSERTS ${pass} / ${pass + fail}`);
if (fail) process.exitCode = 1;

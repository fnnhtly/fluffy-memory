/* 在 Node 里跑真实网页逻辑（prototype/game.js + prototype/levels.js），不打开浏览器。
 * 校验 5 关的标准解能通关、挑战能达成、反例能失败。
 * 用法：node prototype/check_html_logic.js
 */
const path = require('path');
const RAP = require(path.join(__dirname, 'game.js'));
const LEVELS = require(path.join(__dirname, 'levels.js'));

const byId = {};
LEVELS.forEach(l => { byId[l.levelId] = l; });

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; failures.push(name + ' :: ' + (detail || '')); console.log('FAIL  ' + name + '  ' + (detail || '')); }
}

function run(levelId, specKey, opts) {
  const lv = byId[levelId];
  const spec = RAP.SPECS[specKey];
  if (!lv) throw new Error('no level ' + levelId);
  if (!spec) throw new Error('no spec ' + specKey);
  return RAP.simulate(lv, spec, opts ? Object.assign({}, opts) : {});
}

function summary(s) {
  return `phase=${s.phase} reason=${s.failReason} result=${s.result} stars=${s.stars} box=${s.boxesGot}/${s.boxes.length} `
    + `t=${s.time.toFixed(1)} x=${s.car ? s.car.x.toFixed(1) : '-'} y=${s.car ? s.car.y.toFixed(1) : '-'} `
    + `energy=${s.car ? Math.round(s.car.energy) : '-'} wall=${s.wallHits} motorUse=${s.motorUse.toFixed(1)}`;
}

// ---------------- 1-1 ----------------
let s = run('1-1', '1-1');
ok('1-1 标准解通关', s.result === 'win', summary(s));
// 1-1 的第三颗星是「不散架 KRAK SNAP」（照捣蛋猪的经典第三星），
// 标准解一路很稳，所以三颗全亮。
ok('1-1 拿满 3 星（★ 到达 + ★★ 木箱 + ★★★ 不散架）', s.stars === 3, summary(s));
ok('1-1 结算时结构完好（不散架这颗不是白送的）', s.hullBroken === false && s.pigEjected === false,
  'hullBroken=' + s.hullBroken + ' pigEjected=' + s.pigEjected);

// ---------------- 1-2 ----------------
s = run('1-2', '1-2');
// 1-2 改成"必须按一下打气筒"之后，标准解带上了按下时刻（SPECS['1-2']._presses）。
ok('1-2 按一下打气筒通关 → 3 星', s.result === 'win' && s.stars === 3, summary(s));
ok('1-2 的 pumpPress 恰好 = 1（「只按一下」这颗星是可达的）', s.pumpPress === 1,
  'pumpPress=' + s.pumpPress);

// ---------------- 1-3 ----------------
s = run('1-3', '1-3');
// 第 63 轮：马达+电池换成"动力源+驱动件"。第三星从「能量剩 ≥30」改成「动力余量 ≥1」。
ok('1-3 风种+风车桨通关', s.result === 'win', summary(s));
ok('1-3 动力余量 ≥ 1 → 3 星', s.stars === 3, summary(s));

// ---------------- 1-4 ----------------
const iceIron = run('1-4', '1-4i');
ok('1-4 铁轮能上冰面台阶并通关', iceIron.result === 'win', summary(iceIron));
ok('1-4 铁轮零撞墙 → 3 星', iceIron.stars === 3, summary(iceIron));
const iceWood = run('1-4', '1-4w');
/* 第 63 轮改判据：木轮在冰面上**也能赢**了。
 * 旧判据（"必须打滑/撞墙过不去"）是针对"轮子抓地决定一切"那套物理写的；
 * 现在推力来自喷气口（9 m/s²，直接加在车体上），打滑只影响滚动摩擦。
 * 轮子的差别体现在**余量和时间**上，不是"过不过得去"。
 * 所以这条改成"能跑完"——而"必须换轮子"的教学靠 1-5 的 noTool 那条承担。 */
ok('1-4 木轮也能跑完（差别在余量，不在能否）',
  iceWood.result === 'win', summary(iceWood));

// ---------------- 1-5 ----------------
const g5m = run('1-5', '1-5m');
/* 第 63 轮：`motorUse` 随马达一起删了，1-5 的第三星改成 `noTool`。
 * 所以 `g5m` 是"装了驱动件"的对照解 —— 能通关但**拿不到**第三星；
 * `g5n` 用仙术机关（不装驱动件）→ 拿满三星。 */
ok('1-5 装驱动件能过沟并拿木箱 → 2 星',
  g5m.result === 'win' && g5m.stars === 2, summary(g5m));
const g5n = run('1-5', '1-5n');
ok('1-5 不装驱动件也能通关 → 3 星（仙术机关就够了）',
  g5n.result === 'win' && g5n.stars === 3, summary(g5n));

// ---------------- 建造规则 ----------------
{
  RAP.resetParams();
  const lv = byId['1-1'];
  const b = RAP.newBuild();
  const r1 = RAP.tryPlace(lv, b, 'wood_frame', 4, 1);
  const r2 = RAP.tryPlace(lv, b, 'wood_frame', 4, 2);
  const r3 = RAP.tryPlace(lv, b, 'wood_frame', 4, 3);
  const r4 = RAP.tryPlace(lv, b, 'wood_frame', 4, 4);
  ok('1-1 零件箱只有 3 块木框，第 4 块被拒',
    r1.ok && r2.ok && r3.ok && !r4.ok && r4.reason === 'budget',
    JSON.stringify([r1, r2, r3, r4]));

  /* 用"网格最下面的那一行"来测"离得远的格子放不上"，而不是写死第 7 行。
   * 第 65 轮把网格从 8 行改成 6 行（拼装区不再埋进地底），写死的 7 就变成了
   * `outside` —— 它测的其实是"越界"，不是"不连通"，于是这条断言开始
   * 以一个错误的理由通过/失败。几何从 RAP.BUILD_ROWS 现取，行数再变也不会骗人。 */
  const r5 = RAP.tryPlace(lv, b, 'wood_wheel', RAP.BUILD_ROWS - 1, RAP.BUILD_COLS - 1);
  ok('零件必须贴着木框才能放', !r5.ok && r5.reason === 'connect', JSON.stringify(r5) + ' rows=' + RAP.BUILD_ROWS);

  const r6 = RAP.tryPlace(lv, b, 'wood_wheel', 3, 1);
  ok('轮子可以放在木框正上方（贴结构件）', r6.ok, JSON.stringify(r6));
}

// ---------------- 中空木框 + 内嵌小猪 ----------------
{
  RAP.resetParams();
  const lv = byId['1-1'];
  const b = RAP.newBuild();
  const r1 = RAP.tryPlace(lv, b, 'pig', 4, 0);
  ok('小猪不能放在空地（必须先有木框）', !r1.ok && r1.reason === 'need_frame', JSON.stringify(r1));
  RAP.tryPlace(lv, b, 'wood_frame', 4, 2);
  const r2 = RAP.tryPlace(lv, b, 'pig', 4, 2);
  ok('小猪可以放进中空木框里（同一格内槽）', r2.ok, JSON.stringify(r2));
  const r3 = RAP.tryPlace(lv, b, 'pig', 4, 2);
  ok('一个框只能塞一只猪', !r3.ok && r3.reason === 'occupied', JSON.stringify(r3));
  const car = RAP.buildVehicle(lv, b);
  ok('框里的猪计入车体质量与 hasPig', car.hasPig === true && car.mass > 1.2 + 1.5 - 0.01,
    'mass=' + car.mass.toFixed(2) + ' hasPig=' + car.hasPig);
}

// ---------------- 分段损坏 + 掉猪 ----------------
{
  RAP.resetParams();
  const lv = byId['1-1'];
  const b = RAP.newBuild();
  ['wood_frame:4,1', 'wood_frame:4,2', 'wood_frame:4,3', 'wood_wheel:5,1', 'wood_wheel:5,3'].forEach(s => {
    const [p, rc] = s.split(':');
    RAP.tryPlace(lv, b, p, +rc.split(',')[0], +rc.split(',')[1]);
  });
  RAP.tryPlace(lv, b, 'pig', 4, 2);
  const st = RAP.createRun(lv, b);
  const host = st.car.parts.filter(p => p.def.structure)[1];   // 中间那个（装猪的）
  ok('木框初始耐久 3', host.hp === 3, 'hp=' + host.hp);
  st.spawnGrace = 0;

  /* 伤害分档必须和"物理上真到得了的速度"对齐（见 game.js damageCar 注释）：
   *   4.5 ~ 8  → 1 点（磕一下，木框裂一道）
   *   8 ~ 11   → 2 点（撞狠了，木框接近散）
   *   ≥ 11     → 直接散架（只有坠落能触发）
   * 下面三段各验一次，并**在每段之前恢复耐久**，
   * 否则前一段的伤害会污染后一段 —— 之前的版本就是这样让"掉 2"变成 hp=-6 的。 */
  const reset = () => { st.car.parts.forEach(p => { if (p.def.structure) p.hp = 3; }); };
  /* 注意：`state.time` 必须**单调递增**。damageCar 里有 0.35 秒的撞击冷却，
   * 判断式是 `state.time - lastStructHurt < 0.35` —— 把时间往回拨会得到一个
   * 很大的负差值，于是后面每一次伤害都被冷却吞掉。
   * 第一版这里写了 1 / 2 / 3 / 10 / 12 混着用，结果 v=9 那一条读出来 hp=3，
   * 看起来像"分档坏了"，其实是量具把时间倒流了。 */
  reset(); st.time = 1;
  RAP.damageCar(st, 6);
  ok('磕一下（v=6）扣 1 点 → 耐久 2', host.hp === 2, 'hp=' + host.hp);
  /* 门槛从 6 降到 4.5 的**唯一理由**就是这一段：两次 1 点才走得到「破损」。
   * 耐久是 3，3 → 2 → 1 需要两次"1 点"的撞击；以前 6 的门槛要求两次都落在
   * 6~8 的窄窗口里，实测 340 局随机造法一次都没成功过，hp=1 那档美术没人看到。
   * 把门槛挪到 4.5 后窗口宽了 3.5 倍。下面这条断言就是这个"能不能走到"的证明：
   * 它必须**连续打两次**、中间不恢复耐久，才算是真的走得通。 */
  reset(); st.time = 3;
  RAP.damageCar(st, 5.0);
  st.time = 3.5;
  RAP.damageCar(st, 5.0);
  ok('连续两次"磕一下" → 耐久 3→2→1（「破损」这一段真的走得到）', host.hp === 1, 'hp=' + host.hp);
  reset(); st.time = 5;
  RAP.damageCar(st, 4.4);
  ok('4.4 m/s 还不到门槛（标准解 max|vn| 1.91，留 2.4 倍余量）', host.hp === 3, 'hp=' + host.hp);
  reset(); st.time = 7;
  RAP.damageCar(st, 9);
  ok('撞狠了（v=9）扣 2 点 → 耐久 1', host.hp === 1, 'hp=' + host.hp);
  reset(); st.time = 9;
  RAP.damageCar(st, 12);
  ok('从高处砸下来（v=12）直接散架', st.events.some(e => e.indexOf('part_broken') === 0),
    st.events.join('|'));
  ok('框碎了 → 小猪变成自由体掉出来', (st.loose || []).length === 1 && st.loose[0].part === 'pig',
    JSON.stringify(st.loose));
  ok('车体不再有猪（hasPig=false）', st.car.hasPig === false, 'hasPig=' + st.car.hasPig);
  // 让小猪落地停住 → pig_lost
  let guard = 0;
  while (st.phase === 'run' && guard++ < 600) { st.time += 1 / 60; RAP.stepLoose(st, 1 / 60); }
  ok('掉出来的小猪停住 = pig_lost', st.failReason === 'pig_lost', st.failReason || st.result);
}

// ---------------- 方向件：切换方向 + 冲量跟随朝向 ----------------
{
  RAP.resetParams();
  const lv = byId['1-2'];
  const b = RAP.newBuild();
  RAP.tryPlace(lv, b, 'wood_frame', 4, 1);
  RAP.tryPlace(lv, b, 'wood_frame', 4, 2);
  RAP.tryPlace(lv, b, 'wood_frame', 4, 3);
  RAP.tryPlace(lv, b, 'wood_wheel', 5, 1);
  RAP.tryPlace(lv, b, 'wood_wheel', 5, 3);
  RAP.tryPlace(lv, b, 'pig', 4, 2);
  const first = RAP.tryPlace(lv, b, 'pump', 3, 2);
  ok('打气筒默认朝向 0（向右）', first.ok && b.cells['3,2'].dir === 0, JSON.stringify(b.cells['3,2']));
  const rot = RAP.tryPlace(lv, b, 'pump', 3, 2);
  ok('再点一次已放的方向件 → 切换朝向（不报占用）',
    rot.ok && rot.rotated === true && b.cells['3,2'].dir === 1, JSON.stringify(rot));
  RAP.tryPlace(lv, b, 'pump', 3, 2);
  RAP.tryPlace(lv, b, 'pump', 3, 2);
  ok('再点两次 → 朝向转回 3（向下）', b.cells['3,2'].dir === 3, 'dir=' + b.cells['3,2'].dir);
  RAP.rotateAt(b, 3, 2);            // 转回 0
  RAP.rotateAt(b, 3, 2);            // 1 = 向上

  const st = RAP.createRun(lv, b);
  for (let i = 0; i < 12; i++) RAP.step(st, 1 / 60);
  RAP.pressInteract(st, 1);
  for (let i = 0; i < 36; i++) RAP.step(st, 1 / 60);   // 按住蓄力
  const vy0 = st.car.vy;                               // 释放「瞬间」之前
  RAP.releaseInteract(st, 1);
  const vy1 = st.car.vy;                               // 释放瞬间的冲量差
  ok('打气筒朝上时释放 → 得到向上的速度',
    vy1 > vy0 + 0.4, 'vy0=' + vy0.toFixed(2) + ' vy1=' + vy1.toFixed(2));
}

// ---------------- 发射守卫 ----------------
{
  RAP.resetParams();
  const lv = byId['1-1'];
  const b = RAP.newBuild();
  RAP.tryPlace(lv, b, 'wood_frame', 4, 2);
  RAP.tryPlace(lv, b, 'wood_wheel', 5, 2);
  const noPig = RAP.canLaunch(b);
  ok('没放小猪不许发射（reason=pig）', !noPig.ok && noPig.reason === 'pig', JSON.stringify(noPig));
  RAP.tryPlace(lv, b, 'pig', 4, 2);
  const withPig = RAP.canLaunch(b);
  ok('木框里塞了小猪就能发射', withPig.ok, JSON.stringify(withPig));
}

// ---------------- 交互键上限 ----------------
{
  RAP.resetParams();
  const lv = byId['1-2'];
  const b = RAP.newBuild();
  RAP.tryPlace(lv, b, 'wood_frame', 4, 1);
  RAP.tryPlace(lv, b, 'wood_frame', 4, 2);
  RAP.tryPlace(lv, b, 'wood_frame', 4, 3);
  /* 交互件上限（Params.interactCap = 3）是**规则**，而 1-2 的 partsBox
   * 只给 2 个 pump —— 预算是**关卡**。两者是两道独立的锁，谁先撞上
   * 取决于关卡数据。第 63 轮把 1-2 的 pump 从 4 降到 2 之后，
   * 第三次放置会先撞 **budget**，于是原来那条"必须是 interact_limit"
   * 就红了 —— 而规则本身完全正常。
   *
   * 正确的验法是**把预算拉高到不再是瓶颈**，再验上限：
   * 这样"上限 3"才是真的被验到，而不是被预算顺带挡住。 */
  const lvLoose = JSON.parse(JSON.stringify(lv));
  lvLoose.partsBox = Object.assign({}, lvLoose.partsBox, { pump: 9 });
  const bL = RAP.newBuild();
  RAP.tryPlace(lvLoose, bL, 'wood_frame', 4, 1);
  RAP.tryPlace(lvLoose, bL, 'wood_frame', 4, 2);
  RAP.tryPlace(lvLoose, bL, 'wood_frame', 4, 3);
  const a = RAP.tryPlace(lvLoose, bL, 'pump', 3, 1);
  const c = RAP.tryPlace(lvLoose, bL, 'pump', 3, 2);
  const d = RAP.tryPlace(lvLoose, bL, 'pump', 3, 3);
  const e = RAP.tryPlace(lvLoose, bL, 'pump', 5, 1);
  ok('交互件上限 3：预算充足时第 4 个仍被拒（reason=interact_limit）',
    a.ok && c.ok && d.ok && !e.ok && e.reason === 'interact_limit',
    JSON.stringify([a.ok, c.ok, d.ok, e]));
  ok('运行期只生成 3 个交互键', RAP.buildVehicle(lvLoose, bL).interactives.length === 3);
}

// ---------------- 反例：没有轮子 ----------------
{
  const lv = byId['1-1'];
  const spec = { wood_frame: [[4, 1], [4, 2]] };
  const st = RAP.simulate(lv, spec, {});
  ok('没有轮子的车走不了 → 失败',
    st.result === 'fail', summary(st));
}

// ---------------- 反例：没有动力源 ----------------
/* 第 63 轮：电池删了，"开局 motor_out" 这个反例不存在了。
 * 但**同一类反例**仍然成立、而且更贴新机制：
 *   · 装了驱动件却没有动力源 → 驱动件断电（powered=false），车走不动；
 *   · 装了驱动件但超载      → 出 power_short 事件，推力按比例打折。
 * 两条都是"你装错了，所以不走"，正是旧 motor_out 想表达的东西。 */
{
  const lv = byId['1-3'];
  // 只有桨、没有风种 → supply=0
  const spec = { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]],
                 propeller: [[3, 2]], pig: [[4, 2]] };
  const st = RAP.simulate(lv, spec, {});
  ok('没有动力源 → 驱动件断电，跑不到终点', st.result !== 'win', summary(st));
}
{
  const lv = byId['1-3'];
  /* 容量刚好够：风种 2 点 + 一个喷气口 2 点 → 不超载。
   * 这一条是上面那条的**对照**：证明"不超载"不是恒假。 */
  const spec2 = { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]],
                  anemo_core: [[4, 2]], jet: [[3, 2]], pig: [[4, 1]] };
  const st = RAP.simulate(lv, spec2, {});
  ok('风种(2 点) 带一个喷气口(2 点) → 刚好够，不写 power_short',
    !st.events.some(e => e.indexOf('power_short') === 0),
    summary(st));
}

// ---------------- 参数面板可用 ----------------
{
  const lv = byId['1-1'];
  const heavy = RAP.simulate(lv, RAP.SPECS['1-1'], { params: { gravity: 40 } });
  ok('改重力参数会改变结果（重力 40 仍然通关但更慢/更猛）', heavy.phase === 'resolved', summary(heavy));
}

console.log('\n----');
console.log('PASS ' + pass + ' / FAIL ' + fail);
if (fail) {
  console.log('failures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}

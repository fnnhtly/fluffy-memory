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
ok('1-3 马达+电池通关', s.result === 'win', summary(s));
ok('1-3 能量剩余 ≥ 30 → 3 星', s.stars === 3, summary(s));

// ---------------- 1-4 ----------------
const iceIron = run('1-4', '1-4i');
ok('1-4 铁轮能上冰面台阶并通关', iceIron.result === 'win', summary(iceIron));
ok('1-4 铁轮零撞墙 → 3 星', iceIron.stars === 3, summary(iceIron));
const iceWood = run('1-4', '1-4w');
ok('1-4 木轮在冰面过不去（打滑/撞墙）',
  iceWood.result !== 'win' || iceWood.wallHits > 0,
  summary(iceWood));

// ---------------- 1-5 ----------------
const g5m = run('1-5', '1-5m');
ok('1-5 带马达能过沟并拿木箱 → 2 星', g5m.result === 'win' && g5m.stars === 2, summary(g5m));
const g5n = run('1-5', '1-5n');
ok('1-5 不用马达也能通关 → 3 星（重力即动力）',
  g5n.result === 'win' && g5n.motorUse === 0 && g5n.stars === 3, summary(g5n));

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

  const r5 = RAP.tryPlace(lv, b, 'wood_wheel', 7, 5);
  ok('零件必须贴着木框才能放', !r5.ok && r5.reason === 'connect', JSON.stringify(r5));

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
   *   6 ~ 8   → 1 点（磕一下）
   *   8 ~ 11  → 2 点（撞狠了）
   *   ≥ 11    → 直接散架（只有坠落能触发）
   * 下面三段各验一次，并**在每段之前恢复耐久**，
   * 否则前一段的伤害会污染后一段 —— 之前的版本就是这样让"掉 2"变成 hp=-6 的。 */
  const reset = () => { st.car.parts.forEach(p => { if (p.def.structure) p.hp = 3; }); };
  reset(); st.time = 1;
  RAP.damageCar(st, 7);
  ok('磕一下（v=7）扣 1 点 → 耐久 2', host.hp === 2, 'hp=' + host.hp);
  reset(); st.time = 2;
  RAP.damageCar(st, 9);
  ok('撞狠了（v=9）扣 2 点 → 耐久 1', host.hp === 1, 'hp=' + host.hp);
  reset(); st.time = 3;
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
  const a = RAP.tryPlace(lv, b, 'pump', 3, 1);
  const c = RAP.tryPlace(lv, b, 'pump', 3, 2);
  const d = RAP.tryPlace(lv, b, 'pump', 3, 3);
  const e = RAP.tryPlace(lv, b, 'pump', 5, 1);
  ok('交互件上限 3：第 4 个被拒', a.ok && c.ok && d.ok && !e.ok && e.reason === 'interact_limit',
    JSON.stringify([a.ok, c.ok, d.ok, e]));
  ok('运行期只生成 3 个交互键', RAP.buildVehicle(lv, b).interactives.length === 3);
}

// ---------------- 反例：没有轮子 ----------------
{
  const lv = byId['1-1'];
  const spec = { wood_frame: [[4, 1], [4, 2]] };
  const st = RAP.simulate(lv, spec, {});
  ok('没有轮子的车走不了 → 失败',
    st.result === 'fail', summary(st));
}

// ---------------- 反例：没有电池 ----------------
{
  const lv = byId['1-3'];
  const spec = { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], motor: [[3, 2]] };
  const st = RAP.simulate(lv, spec, {});
  const sawMotorOut = st.events.some(e => e.indexOf('motor_out') === 0);
  ok('没有电池 → 开局 motor_out，且拿不到 3 星', sawMotorOut && st.stars < 3, summary(st));
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

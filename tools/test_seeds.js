/* 种子三兄弟 + 删掉动力容量（第 71 轮，用户要求）。
 *
 * 用户原话：「不要设置什么动力容量的设定，让风种子可以一次性生成一个范围风场
 * 让携带伞/风之翼的车向上飞，让岩种子可以一次性从脚底升成一个范围性的岩柱
 * 让车抬升，雷种子可以让车进入一种状态，让车在一定时间内快速冲刺并且可以穿过
 * 雷屏障」
 *
 * 这一段是**规格**，不是实现记录。它先于实现写，先红后绿。
 * 每条断言都必须能在"实现错了"的时候变红 —— 写完会逐条做反向验证。
 */
console.log('RUNTIME: node');
const R = require('../prototype/game.js');

let pass = 0, fail = 0;
function chk(label, cond, extra) {
  if (cond) { pass++; console.log('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('✗ ' + label + '  ' + (extra || '')); }
}
const out = [];
function log(m) { out.push(m); console.log('  ' + m); }

/* 给足零件预算的小关卡工厂。
 *
 * ⚠ 终点故意放在 col 36（几乎到地图尽头）：这一组用例里有很多条要
 * "跑满 N 秒再读数"，而终点线一旦在 12 格处，车跑 2 秒就赢 ——
 * 一赢 `state.phase` 变成 resolved，`step()` 立刻 return，
 * 后面所有读数都停在结算那一刻。
 * `test_seeds` 第一版就是这么被骗的：D5「冲刺状态会过期」量到
 * dashT=2.57，看起来像"计时器不走"，其实是车早就赢了。 */
function mkLevel(extra) {
  const lv = {
    levelId: 'test', start: { col: 1 }, goal: { col: 36 },
    grid: { cols: 40, rows: 14 }, mapRows: [], partsBox: {},
    timeLimit: 120, boxes: [], materials: [{ cols: [0, 39], type: 'mud' }]
  };
  // 一条平地（row 8 起是实心）
  lv.mapRows = [];
  for (let r = 0; r < 14; r++) lv.mapRows.push(r < 8 ? '.'.repeat(40) : '#'.repeat(40));
  Object.keys(R.PARTS).forEach(id => { lv.partsBox[id] = 20; });
  Object.assign(lv, extra || {});
  return lv;
}

/* 标准底盘：三块框、两个轮子、猪在中间。
 * ⚠ 内嵌件（种子/猪）**一格只能塞一件**，所以它们必须占不同的框。
 * 下面每个用例都自己指定种子放在哪个空格 —— 这也是六关标准解的通则。 */
const CHASSIS = { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]],
                  pig: [[4, 2]] };

function build(lv, spec) {
  const b = R.newBuild();
  R.applySpec(lv, b, spec);
  return b;
}

/* ══════════ A 动力容量系统必须**彻底**消失 ══════════
 *
 * "删掉"不是"藏起来"。用户说不要这个设定，那么：
 *   · 零件表里不能还有 powerSrc / drawPower（留着就还能被别的代码读）；
 *   · 车上不能还有 powerSupply / powerDemand / powerShort 三个读数
 *     （留着 HUD 就会继续画）；
 *   · powerGrid 这个导出要删（留着说明还有代码在依赖图形连通性）。
 * 三条都判，是因为**只删一条**的时候，另外两条会让界面继续显示容量。
 */
{
  const defs = R.PARTS;
  const withSrc = Object.keys(defs).filter(k => 'powerSrc' in defs[k]);
  chk('A1 没有任何零件还带 powerSrc', withSrc.length === 0,
    withSrc.length ? withSrc.join(',') : '干净');
  const withDraw = Object.keys(defs).filter(k => 'drawPower' in defs[k]);
  chk('A2 没有任何零件还带 drawPower', withDraw.length === 0,
    withDraw.length ? withDraw.join(',') : '干净');
  chk('A3 RAP.powerGrid 已删除', typeof R.powerGrid === 'undefined',
    typeof R.powerGrid);

  const lv = mkLevel();
  const b = build(lv, { wood_frame: [[4, 1], [4, 2]], wood_wheel: [[5, 1], [5, 2]],
                        pig: [[4, 1]] });
  const car = R.buildVehicle(lv, b);
  chk('A4 车上没有 powerSupply', car && car.powerSupply === undefined,
    car && String(car.powerSupply));
  chk('A5 车上没有 powerDemand', car && car.powerDemand === undefined,
    car && String(car.powerDemand));
  chk('A6 车上没有 powerShort', car && car.powerShort === undefined,
    car && String(car.powerShort));
  /* 驱动件不再需要"接通"这个前置条件：风车桨装了就该出力。
   * `powered` 这个字段如果还在，说明接通逻辑还活着。 */
  const carWithTool = (() => {
    const lv2 = mkLevel();
    const b2 = build(lv2, { wood_frame: [[4, 1], [4, 2]], wood_wheel: [[5, 1], [5, 2]],
                            pig: [[4, 1]], propeller: [[3, 1]] });
    return R.buildVehicle(lv2, b2);
  })();
  const prop = carWithTool && carWithTool.parts.find(p => p.part === 'propeller');
  chk('A7 驱动件不再依赖"通电"（powered 字段已删）', prop && prop.powered === undefined,
    prop ? String(prop.powered) : '桨没装上');
}

/* ══════════ B 风种：一次性范围风场，只有带伞/风之翼的车被托起来 ══════════ */
{
  /* 前提：风种和伞都是零件表里的东西。缺了后面全是 undefined 比较。 */
  chk('B1 零件表里有风种', !!R.PARTS.anemo_core, R.PARTS.anemo_core && R.PARTS.anemo_core.label);
  chk('B2 零件表里有伞', !!R.PARTS.umbrella, R.PARTS.umbrella && R.PARTS.umbrella.label);
  chk('B3 零件表里有风之翼', !!R.PARTS.wind_wing, R.PARTS.wind_wing && R.PARTS.wind_wing.label);

  /* B4–B6：**没有**伞的车站在风场里不该飞起来。
   * 这是"风场只对吃风的零件做功"这条规则的**反向对照** ——
   * 少了它，一个"风场无条件抬升全车"的实现也能通过所有正向断言。 */
  {
    const lv = mkLevel();
    const b = build(lv, Object.assign({}, CHASSIS, { anemo_core: [[4, 1]] }));
    const st = R.createRun(lv, b);
    R.triggerSeed(st, 'anemo');
    const field = st.windField;
    chk('B4 触发风种 → 生成一个风场', !!field, field ? '半径 ' + field.r + ' 米' : '没有');
    chk('B5 风场是**范围**的（半径 ≥ 4 米）', field && field.r >= 4,
      field && field.r + ' 米');
    const y0 = st.car.y;
    for (let i = 0; i < 90; i++) R.step(st, 1 / 60);      // 1.5 秒
    const dy = st.car.y - y0;
    chk('B6 没带伞的车在风场里**不会**被托起来', dy < 0.5, '升高 ' + dy.toFixed(2) + ' 米');
  }

  /* B7–B9：带伞的车会被托起来 */
  {
    const lv = mkLevel();
    const b = build(lv, Object.assign({}, CHASSIS, { anemo_core: [[4, 1]], umbrella: [[3, 2]] }));
    const st = R.createRun(lv, b);
    const um = st.car && st.car.parts.find(p => p.part === 'umbrella');
    chk('B7 前提：伞装上了', !!um, um ? 'r=' + um.r + ',c=' + um.c : '没装上');
    R.triggerSeed(st, 'anemo');
    const y0 = st.car.y;
    let peak = y0;
    for (let i = 0; i < 90; i++) { R.step(st, 1 / 60); peak = Math.max(peak, st.car.y); }
    const dy = peak - y0;
    chk('B8 带伞的车被风场托起来（升高 ≥ 1.5 米）', dy >= 1.5,
      '峰值 +' + dy.toFixed(2) + ' 米');
    /* 风之翼更重、托得更高 —— 两件零件必须有真实差别，
     * 否则"伞/风之翼"就只是同一个东西的两个名字。 */
    const lv2 = mkLevel();
    const b2 = build(lv2, Object.assign({}, CHASSIS, { anemo_core: [[4, 1]], wind_wing: [[3, 2]] }));
    const st2 = R.createRun(lv2, b2);
    R.triggerSeed(st2, 'anemo');
    const y2 = st2.car.y;
    let peak2 = y2;
    for (let i = 0; i < 90; i++) { R.step(st2, 1 / 60); peak2 = Math.max(peak2, st2.car.y); }
    const dy2 = peak2 - y2;
    chk('B9 风之翼比伞托得更高（两件零件有真实差别）', dy2 > dy,
      '风之翼 +' + dy2.toFixed(2) + ' vs 伞 +' + dy.toFixed(2) + ' 米');
  }

  /* B10–B11：风场会过期；风种只能用一次 */
  {
    const lv = mkLevel();
    const b = build(lv, Object.assign({}, CHASSIS, { anemo_core: [[4, 1]], wind_wing: [[3, 2]] }));
    const st = R.createRun(lv, b);
    R.triggerSeed(st, 'anemo');
    chk('B10 风场有寿命（ttl > 0）', st.windField && st.windField.ttl > 0,
      st.windField && st.windField.ttl + ' 秒');
    for (let i = 0; i < 60 * 5; i++) R.step(st, 1 / 60);    // 5 秒
    chk('B11 风场会过期（5 秒后消失）', !st.windField, st.windField ? '还在' : '已消失');
    const before = st.seedUse && st.seedUse.anemo;
    R.triggerSeed(st, 'anemo');
    chk('B12 风种只能用一次（第二次触发无效）',
      (st.seedUse && st.seedUse.anemo) === before && !st.windField,
      '用了 ' + (st.seedUse && st.seedUse.anemo) + ' 次');
  }
}

/* ══════════ C 岩种：脚下升起一根**有宽度**的岩柱把车抬起来 ══════════ */
{
  const lv = mkLevel();
  const b = build(lv, Object.assign({}, CHASSIS, { geo_core: [[4, 1]] }));
  const st = R.createRun(lv, b);
  const y0 = st.car.y;
  R.triggerSeed(st, 'geo');
  chk('C1 触发岩种 → 生成一根岩柱', st.pillars && st.pillars.length === 1,
    st.pillars ? st.pillars.length + ' 根' : '没有');
  const pil = st.pillars && st.pillars[0];
  chk('C2 岩柱是**范围性**的（宽度 ≥ 1.5 米）', pil && pil.w >= 1.5,
    pil && pil.w + ' 米');
  const surf0 = st.terrain.surfaceY(st.car.x);
  chk('C3 岩柱顶比原地表高出 ≥ 2 米', pil && (pil.top - surf0) >= 2,
    pil && (pil.top - surf0).toFixed(2) + ' 米');

  for (let i = 0; i < 90; i++) R.step(st, 1 / 60);
  const dy = st.car.y - y0;
  chk('C4 车被岩柱抬起来（升高 ≥ 1.5 米）', dy >= 1.5, '升高 ' + dy.toFixed(2) + ' 米');

  /* C5：岩柱只在它的 x 范围内生效。这条是"范围性"的反面 ——
   * 如果实现成"整条地平面一起抬高"，车当然也会升高，C4 就白测了。 */
  const outsideX = st.car.x + pil.w;
  const gOut = R.groundY(st, outsideX);
  const gIn = R.groundY(st, pil.x);
  chk('C5 岩柱范围之外地表不受影响', Math.abs(gOut - st.terrain.surfaceY(outsideX)) < 0.01,
    '范围外 ' + gOut.toFixed(2) + ' vs 地形 ' + st.terrain.surfaceY(outsideX).toFixed(2));
  /* ⚠ 探针要取**柱子中心**（pil.x），不是车当前位置 ——
   * 车被托上去之后会往旁边滚，`st.car.x` 可能已经出了柱子范围。
   * 第一版就写成 `groundY(st, st.car.x)`，量到 6.00（原地形）而不是 9.00，
   * 看起来像"柱顶没生效"，其实是"车已经不在柱子上面了"。 */
  chk('C6 岩柱范围内地表就是柱顶', Math.abs(gIn - pil.top) < 0.01,
    '柱心处 ' + gIn.toFixed(2) + ' vs 柱顶 ' + pil.top.toFixed(2) +
    '（车现在 x=' + st.car.x.toFixed(2) + '，柱心 x=' + pil.x.toFixed(2) + '）');

  const before = st.seedUse.geo;
  R.triggerSeed(st, 'geo');
  chk('C7 岩种只能用一次', st.seedUse.geo === before && st.pillars.length === 1,
    '用了 ' + st.seedUse.geo + ' 次，' + st.pillars.length + ' 根柱');
}

/* ══════════ D 雷种：限时冲刺 + 穿过雷屏障 ══════════ */
{
  chk('D1 零件表里有雷种', !!R.PARTS.electro_core,
    R.PARTS.electro_core && R.PARTS.electro_core.label);

  /* D2–D4：冲刺状态本身 */
  {
    /* ⚠ 这一组把终点推到 col 999（地图外）。
     *
     * 冲刺 4 秒 × 9.5 m/s ≈ 38 米，从 x=1.6 出发正好越过 col 36 的终点线 ——
     * 车一赢，`step()` 就 return，计时器停住。
     * D5 就是这么红过一次：它量到 dashT=0.03，看起来像"计时器不走"，
     * 其实是**这一局已经结束了**。测试要观察"限时状态会不会自然结束"，
     * 就不能让另一条胜利条件先把它截断。 */
    const lv = mkLevel({ goal: { col: 999 } });
    const b = build(lv, Object.assign({}, CHASSIS, { electro_core: [[4, 1]] }));
    const st = R.createRun(lv, b);
    chk('D2 前提：雷种装上了', st.car.parts.some(p => p.part === 'electro_core'),
      '车上有 ' + st.car.parts.length + ' 件');
    R.triggerSeed(st, 'electro');
    chk('D3 触发雷种 → 车进入冲刺状态', (st.car.dashT || 0) > 0,
      'dashT=' + (st.car.dashT || 0).toFixed(2) + ' 秒');
    const t0 = st.car.dashT;
    for (let i = 0; i < 30; i++) R.step(st, 1 / 60);
    chk('D4 冲刺期间车真的在加速（vx 显著上升）', Math.abs(st.car.vx) > 2.0,
      'vx=' + st.car.vx.toFixed(2));
    for (let i = 0; i < 60 * 4; i++) R.step(st, 1 / 60);
    chk('D5 冲刺状态会过期', (st.car.dashT || 0) <= 0,
      'dashT=' + (st.car.dashT || 0).toFixed(2) + '，起始 ' + t0.toFixed(2));
  }

  /* D6–D8：雷屏障。这是"雷种"真正的用途 —— 没有屏障，冲刺只是加速。
   *
   * ⚠ 这一对用例**必须让车有推力**。
   *
   * 第一版的车只有雷种、没有驱动件，于是"不冲刺 → 车停在原地 x=1.64"，
   * 断言 `x < 8.6` 通过了 —— 但把**整段屏障代码删掉**它仍然通过（我实测过）：
   * 车根本不会往那边开，屏障存不存在都一样。
   * 一条删掉被测代码还不红的判据，量的不是屏障。
   * 现在给车装一个朝右的风车桨：不冲刺时它会被屏障顶住，
   * 冲刺时才过得去 —— 两者才有区别。 */
  const withProp = Object.assign({}, CHASSIS,
    { electro_core: [[4, 1]], propeller: [[3, 2]] });
  {
    /* 在 x=8 立一道雷屏障：从地表往上 4 米 */
    const lv = mkLevel({ barriers: [{ col: 8, h: 4 }], goal: { col: 999 } });
    const b = build(lv, withProp);
    const st = R.createRun(lv, b);
    R.applySpecRuntime(st, { _dirs: { propeller: 0 } });

    /* 反向对照：有推力但不冲刺 → 被挡住 */
    for (let i = 0; i < 60 * 3; i++) R.step(st, 1 / 60);
    chk('D6 有推力但不冲刺时被雷屏障挡住（车卡在屏障前）',
      st.car.x < 8.6 && st.car.x > 3,
      'x=' + st.car.x.toFixed(2) + '（屏障在 8）');

    const lv2 = mkLevel({ barriers: [{ col: 8, h: 4 }], goal: { col: 999 } });
    const b2 = build(lv2, withProp);
    const st2 = R.createRun(lv2, b2);
    R.applySpecRuntime(st2, { _dirs: { propeller: 0 } });
    R.triggerSeed(st2, 'electro');
    let passed = false;
    for (let i = 0; i < 60 * 3; i++) {
      R.step(st2, 1 / 60);
      if (st2.car.x > 10) { passed = true; break; }
    }
    chk('D7 同样的车触发雷种后能穿过屏障（越过屏障 2 米以上）', passed,
      'x=' + st2.car.x.toFixed(2) + ' 冲刺剩余 ' + (st2.car.dashT || 0).toFixed(2));
  }
}

/* ══════════ E 六个标准解仍然成立 ══════════ */
{
  const levels = require('../prototype/levels.js');
  const SPEC_OF = { '1-1': '1-1', '1-2': '1-2', '1-3': '1-3',
                    '1-4': '1-4w', '1-5': '1-5m', '1-6': '1-6' };
  Object.keys(SPEC_OF).forEach(key => {
    const lv = levels.filter(l => l.levelId === key)[0];
    const spec = R.SPECS[SPEC_OF[key]];
    if (!lv || !spec) { chk('E ' + key + ' 标准解能通关', false, '缺关卡或标准解'); return; }
    const st = R.simulate(lv, spec, { maxTime: 90 });
    chk('E ' + key + ' 标准解仍然能通关', st.result === 'win',
      'result=' + st.result + ' reason=' + (st.failReason || '-') +
      ' t=' + st.time.toFixed(1) + 's');
  });
}

console.log('');
if (out.length) console.log(out.join('\n'));
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
if (fail) console.log('失败项：' + fail + ' 条');
process.exit(fail ? 1 : 0);

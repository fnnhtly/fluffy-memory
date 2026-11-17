/* 驱动件出力 + 系挂校验。
 *
 * ⚠ 第 71 轮：这个脚本原来验的是**动力连通性**（"驱动件必须连到动力源、
 * 还要吃容量、超载打折"）—— 用户明确要求删掉那套设定，A/B/C/D 四段
 * 的前提整个消失了。现在它们换成新机制下的**同类反例**：
 *
 *   A  驱动件装了就一直出力（不再需要动力源、不再需要连通）
 *   B  驱动件装在离框很远的地方也照样出力（旧规则会判它断电）
 *   C  没有种子也能跑（旧规则会判"没有动力源"）
 *   D  种子是**一次性**的（旧规则这里是"超载"，现在是"用了就不能再用"）
 *
 * 参考（萌娘百科「捣蛋猪」）的系挂规则仍然有效，E/F 两段保持原样。
 *
 * ⚠ 坐标系：建造网格 **row 越大越靠下**（partPos: y = ROWS_anchor − r）。
 * 所以：
 *   气球要"框在它下方" = 气球的 row 比框**小**（球在上、框在下）
 *   沙袋要"框在它上方" = 沙袋的 row 比框**大**（框在上、石在下）
 * 这一版之前引擎和测试把方向一起写反了 —— 两边同错反而"通过"过一次。
 */
const R = require('../prototype/game.js');

/* 自报运行环境（见 tools/lib/verdict.js）：纯 Node 测试不开浏览器，
 * 所以没有 `errors: (none)` 可报。不写这一行会被判定成"有页面异常"。 */
console.log('RUNTIME: node');

let pass = 0, fail = 0;
function chk(label, cond, extra) {
  if (cond) { pass++; console.log('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('✗ ' + label + '  ' + (extra || '')); }
}

function mk(parts) {
  /* partsBox 必须**给足预算**，否则 tryPlace 全部被拒（budgetLeft = 0），
   * 然后 buildVehicle 返回 null。第一版就是这么崩的（读 null.parts）。 */
  const lv = { levelId: 't', start: { col: 1 }, goal: { col: 30 },
               grid: { cols: 40, rows: 18 },
               mapRows: [], partsBox: {}, timeLimit: 120, boxes: [],
               materials: [{ cols: [0, 39], type: 'mud' }] };
  for (let r = 0; r < 18; r++) lv.mapRows.push(r < 10 ? '.'.repeat(40) : '#'.repeat(40));
  Object.keys(R.PARTS).forEach(id => { lv.partsBox[id] = 20; });
  const b = R.newBuild();
  const fails = [];
  parts.forEach(p => {
    const r = R.tryPlace(lv, b, p[0], p[1], p[2]);
    if (!r.ok) fails.push(p[0] + '@' + p[1] + ',' + p[2] + ' → ' + r.reason);
  });
  if (fails.length) console.log('  (放置被拒: ' + fails.join('; ') + ')');
  return { lv, b };
}
const find = (car, id) => (car && car.parts ? car.parts.find(p => p.part === id) : undefined);

// ---- A 驱动件装了就一直出力（第 71 轮：不再需要动力源） ----
{
  const { lv, b } = mk([['wood_frame', 4, 2], ['propeller', 3, 2],
                        ['wood_wheel', 5, 2], ['pig', 4, 2]]);
  const c = R.buildVehicle(lv, b);
  const pp = find(c, 'propeller');
  chk('A1 框 + 桨（没有动力源）→ 桨照样在车上', !!pp, pp ? '装上了' : '没装上');
  chk('A2 车上没有 powerSupply（容量系统已删）', c && c.powerSupply === undefined,
    String(c && c.powerSupply));
  chk('A3 车上没有 powerDemand', c && c.powerDemand === undefined,
    String(c && c.powerDemand));
  chk('A4 零件上没有 powered（不再有"通电"这个前置）',
    pp && pp.powered === undefined, String(pp && pp.powered));

  /* 真正要验的：这辆车跑起来桨真的在出力。
   * 判据是"车往右走了" —— 而不是某个内部字段被置成了 true。 */
  const st = R.createRun(lv, b);
  const x0 = st.car.x;
  for (let i = 0; i < 60; i++) R.step(st, 1 / 60);
  chk('A5 没有动力源的桨仍然把车推向右边（60 帧后 x 前进 > 0.5 米）',
    st.car.x - x0 > 0.5, 'Δx=' + (st.car.x - x0).toFixed(2) + ' 米');
}

// ---- B 桨不需要连到种子（旧规则：必须紧贴动力源才通电） ----
{
  /* ⚠ 注意还有一条**别的**规则：`tryPlace` 的 `connect` ——
   * 零件必须和已经摆好的东西相邻（不能凭空浮着）。那条是**摆放**规则，
   * 和动力容量无关，第 71 轮保留。所以这里不能把桨放到离框 3 格的地方
   * （会被 connect 拒掉，然后这辆车根本没有桨，±Δx 当然一样）。
   *
   * 要验的是"**离种子远**也照样出力"：种子塞在 4,1，桨装在 3,3 ——
   * 两者隔了两格，旧规则会判它断电。 */
  function run(parts) {
    const { lv, b } = mk(parts);
    const st = R.createRun(lv, b);
    const x0 = st.car.x;
    for (let i = 0; i < 60; i++) R.step(st, 1 / 60);
    return { dx: st.car.x - x0, hasProp: st.car.parts.some(p => p.part === 'propeller') };
  }
  const far = run([['wood_frame', 4, 1], ['wood_frame', 4, 2], ['wood_frame', 4, 3],
                   ['anemo_core', 4, 1], ['propeller', 3, 3],
                   ['wood_wheel', 5, 1], ['wood_wheel', 5, 3], ['pig', 4, 2]]);
  const none = run([['wood_frame', 4, 1], ['wood_frame', 4, 2], ['wood_frame', 4, 3],
                    ['anemo_core', 4, 1],
                    ['wood_wheel', 5, 1], ['wood_wheel', 5, 3], ['pig', 4, 2]]);
  chk('B0 前提：桨真的装上了（否则下面的比较没有意义）', far.hasProp, String(far.hasProp));
  chk('B1 桨离种子两格也照样出力（比不装桨跑得远）',
    far.dx > none.dx + 0.15,
    '装桨 Δx=' + far.dx.toFixed(2) + ' vs 不装 ' + none.dx.toFixed(2) + ' 米');
}

// ---- C 完全不装种子也能跑（旧规则：没有动力源就跑不动） ----
{
  const { lv, b } = mk([['wood_frame', 4, 2], ['wood_wheel', 5, 2], ['pig', 4, 2]]);
  const st = R.createRun(lv, b);
  chk('C1 一颗种子都没装 → 车照样能出发', st && st.phase === 'run',
    st ? st.phase : 'null');
  chk('C2 seedUse 三个计数都是 0', st && st.seedUse &&
    st.seedUse.anemo === 0 && st.seedUse.geo === 0 && st.seedUse.electro === 0,
    st && JSON.stringify(st.seedUse));
}

// ---- D 种子是一次性的（旧规则这里验的是"超载"） ----
{
  const { lv, b } = mk([['wood_frame', 4, 2], ['anemo_core', 4, 2],
                        ['wood_wheel', 5, 2], ['pig', 4, 2]]);
  const st = R.createRun(lv, b);
  const first = R.triggerSeed(st, 'anemo');
  const second = R.triggerSeed(st, 'anemo');
  chk('D1 第一次触发风种成功', first === true, String(first));
  chk('D2 第二次触发被拒（一次性）', second === false, String(second));
  chk('D3 使用计数是 1，不会涨到 2', st.seedUse.anemo === 1, String(st.seedUse.anemo));
  /* 对照：另一颗种子不该被这次触发影响。 */
  const { lv: lv2, b: b2 } = mk([['wood_frame', 4, 2], ['anemo_core', 4, 2],
                                 ['geo_core', 5, 2], ['wood_wheel', 5, 4], ['pig', 4, 2]]);
  const st2 = R.createRun(lv2, b2);
  R.triggerSeed(st2, 'anemo');
  chk('D4 用掉风种不影响岩种（两颗种子各自独立）',
    st2.seedUse.anemo === 1 && st2.seedUse.geo === 0,
    JSON.stringify(st2.seedUse));
}

/* ---- E 热气球系挂 ----
 * 球在上（row 小）、框在下（row 大）→ 系住。
 * 框在上（row 小）、球在下（row 大）→ 挂空，球飘走。 */
{
  // 球 r=3、框 r=4 → 框在球下方 → 系住
  const { lv, b } = mk([['wood_frame', 4, 2], ['balloon', 3, 2],
                        ['wood_wheel', 5, 2], ['pig', 4, 2]]);
  const c = R.buildVehicle(lv, b);
  chk('E1 球在上、框在下 → 系挂成立（气球就该这样挂）',
    find(c, 'balloon') && find(c, 'balloon').tethered === true,
    'tethered=' + (find(c, 'balloon') && find(c, 'balloon').tethered));
  chk('E2 系住的球提供浮力', c && c.liftMass > 0, 'liftMass=' + (c && c.liftMass));
}
{
  // 框 r=2、球 r=3 → 框在球上方 → 挂空
  const { lv, b } = mk([['wood_frame', 2, 2], ['balloon', 3, 2],
                        ['wood_wheel', 4, 2], ['pig', 2, 2]]);
  const c = R.buildVehicle(lv, b);
  chk('E3 框在上、球在下 → 挂空（球会飘走）',
    find(c, 'balloon') && find(c, 'balloon').tethered === false,
    'tethered=' + (find(c, 'balloon') && find(c, 'balloon').tethered));
  chk('E4 未系挂的气球不提供浮力', c && c.liftMass === 0, 'liftMass=' + (c && c.liftMass));
  chk('E5 未系挂的球被单独计数（HUD 要提示"飘走"）',
    c && c.looseBalloons > 0, 'loose=' + (c && c.looseBalloons));
}

/* ---- F 压舱石系挂 ----
 * 框在上（row 小）、石在下（row 大）→ 系住。
 * 石在上、框在下 → 落地。 */
{
  // 框 r=3、石头 r=4 → 框在上 → 系住
  const { lv, b } = mk([['wood_frame', 3, 2], ['sandbag', 4, 2],
                        ['wood_wheel', 5, 2], ['pig', 3, 2]]);
  const c = R.buildVehicle(lv, b);
  chk('F1 框在上、石在下 → 系挂成立',
    find(c, 'sandbag') && find(c, 'sandbag').tethered === true,
    'tethered=' + (find(c, 'sandbag') && find(c, 'sandbag').tethered));
  chk('F2 系住的石头计入可扔数量', c && c.sandbagCount > 0,
    'sandbagCount=' + (c && c.sandbagCount));
}
{
  /* 石 r=3、框 r=4 → 框在下 → 落地。
   * 但放置规则要求零件必须**贴着结构件**（canPlace 的 connect），
   * 而 r=3 的石头上方没有东西 → 单独放不进去。
   * 所以先放框（给它一个邻居），再把石头贴在框的**正上方**：
   *   (2,2)=框  (3,2)=石  → 石在框下方……
   * 那是 F1 的"系住"情形，不是落地。
   *
   * 真正能表达"落地"的摆法是：**石头在框的正上方一格**，
   * 但框本身挂在别的框下面。也就是
   *   (2,2)=框  (1,2)=石  → 石在框**上方** → 沙袋找不到"上方的框" → 落地。
   * 石头的 row(1) 比框(2) 小，往 r−1 方向找框，找不到 → ok=false。 */
  const { lv, b } = mk([['wood_frame', 2, 2], ['sandbag', 1, 2],
                        ['wood_wheel', 3, 2], ['pig', 2, 2]]);
  const c = R.buildVehicle(lv, b);
  const sb = find(c, 'sandbag');
  chk('F3 石头在框正上方（往上方找不到框）→ 落地（不生效）',
    sb && sb.tethered === false, sb ? 'tethered=' + sb.tethered : '石头没放上去');
  chk('F4 未系挂的石头不计入可扔数量', c && c.sandbagCount === 0,
    'sandbagCount=' + (c && c.sandbagCount));
}

console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
if (fail) { console.log('失败项：见上面的 ✗'); process.exit(1); }

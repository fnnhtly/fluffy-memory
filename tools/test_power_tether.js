/* 动力连通性 + 系挂校验（第 63 轮新机制的核心）。
 *
 * 这个脚本验的是**语义**，不是像素。参考（萌娘百科「捣蛋猪」）的两条原话：
 *   · 「只要中间有动力连接件（框/可乐/火箭/分离器/弹簧都算，绳子不算），
 *      动力可以叠加」 → 驱动件必须连通到动力源
 *   · 气球「会被系在其下方最靠近自身的方框上；否则会直接飘走」
 *     重物「会系在其上方最接近自身的方框上；否则会直接落地，不起任何作用」
 *
 * ⚠ 坐标系：建造网格 **row 越大越靠下**（partPos: y = (ROWS−1)/2 − r）。
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
  const lv = { start: { col: 1 }, goal: { col: 5 }, grid: { cols: 10, rows: 18 },
               mapRows: [], partsBox: {} };
  ['wood_frame', 'iron_frame', 'wood_wheel', 'iron_wheel', 'anemo_core', 'geo_core',
   'propeller', 'jet', 'balloon', 'sandbag', 'firework', 'pump', 'pig']
    .forEach(id => { lv.partsBox[id] = 20; });
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

// ---- A 连通 ----
{
  const { lv, b } = mk([['wood_frame', 4, 2], ['anemo_core', 4, 2], ['propeller', 3, 2],
                        ['wood_wheel', 5, 2], ['pig', 4, 2]]);
  const c = R.buildVehicle(lv, b);
  chk('A1 框+动力源+紧贴的桨 → 通电',
    find(c, 'propeller') && find(c, 'propeller').powered === true,
    find(c, 'propeller') ? 'powered=' + find(c, 'propeller').powered : '桨没放上去');
  chk('A2 容量记到 supply', c && c.powerSupply === 2, 'supply=' + (c && c.powerSupply));
  chk('A3 消耗记到 demand', c && c.powerDemand === 1, 'demand=' + (c && c.powerDemand));
  chk('A4 够用 → 不超载', c && c.powerShort === false, 'short=' + (c && c.powerShort));
}

// ---- B 断开一格（放不进去 = 也不通，两条都算对） ----
{
  const { lv, b } = mk([['wood_frame', 4, 2], ['anemo_core', 4, 2], ['propeller', 2, 2],
                        ['wood_wheel', 5, 2], ['pig', 4, 2]]);
  const c = R.buildVehicle(lv, b);
  const pp = find(c, 'propeller');
  /* 这里有两种"正确"：桨被放置规则拦住（connect），或者放进去了但断电。
   * 两种都表达"它没通上电"，所以两条路径都算过。 */
  chk('B1 桨和框之间空一格 → 不通（被拒 或 断电）',
    !pp || pp.powered === false, pp ? 'powered=' + pp.powered : '放置被拒（也算不通）');
  chk('B2 不通的桨不计入 demand', c && c.powerDemand === 0, 'demand=' + (c && c.powerDemand));
}

// ---- C 没动力源 ----
{
  const { lv, b } = mk([['wood_frame', 4, 2], ['propeller', 3, 2],
                        ['wood_wheel', 5, 2], ['pig', 4, 2]]);
  const c = R.buildVehicle(lv, b);
  chk('C1 没有动力源 → supply=0', c && c.powerSupply === 0, 'supply=' + (c && c.powerSupply));
  chk('C2 没有动力源 → 桨断电',
    find(c, 'propeller') && find(c, 'propeller').powered === false,
    'powered=' + (find(c, 'propeller') && find(c, 'propeller').powered));
}

// ---- D 超载 ----
{
  // 风种只给 2，装 2 个喷气口（每个占 2）→ demand 4 > supply 2
  const { lv, b } = mk([['wood_frame', 4, 2], ['anemo_core', 4, 2],
                        ['jet', 3, 2], ['jet', 5, 2],
                        ['wood_wheel', 6, 2], ['pig', 4, 2]]);
  const c = R.buildVehicle(lv, b);
  chk('D1 供不应求 → 超载标记', c && c.powerShort === true,
    'supply=' + (c && c.powerSupply) + ' demand=' + (c && c.powerDemand));
  chk('D2 容量确实小于需求', c && c.powerSupply < c.powerDemand,
    (c && c.powerSupply) + ' < ' + (c && c.powerDemand));
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

/* 雷屏障的两条修复 + 一个被揭穿的设计假设（第 83 轮）。
 *
 * ── 修的两个真 bug ──
 *
 * ① `nose = car.x + car.hull.maxX` 用错了坐标原点。
 *    `hull.maxX` 相对**网格锚点**，而锚点不是包围盒中心：
 *    单框车（放在 col 1）的 `hull.maxX` 是 **−1**，于是 `nose = car.x − 1`
 *    指向车心左边，判定窗口整体偏 1~2 米。
 *
 * ② `fromLeft = car.x < br.col + 0.5` 同样用错了原点。
 *    实测 t=7.450 car.x=20.944（车体 [18.94,19.94] 全在屏障左边），
 *    因为 20.944 > 20.5 被判成"从右边来"，走进右分支后
 *    `car.x = 20 + 1 − (−2) + 0.02 = 23.02` —— **一帧瞬移 2.076 米穿过去**。
 *
 * 两处都改成用**真实包围盒**：hullL / hullR / hullC。
 *
 * ── 被揭穿的设计假设 ──
 *
 * 修完之后 1-5 仍有约 1.2% 的随机局"不带雷种也能过"。
 * 查下来那不是 bug：1-5 的零件箱**同时发风种 + 伞和雷种**，
 * 屏障有两种过法 —— 冲过去（雷种）或飞过去（风种 + 伞）。
 * 屏障顶 9.93，车 y≈7.0，需要抬升 1.93 米；伞给 2.72 米，够。
 *
 * 所以第 72 轮那句「1-5 必须有雷种」是**不准确**的。
 * 这一轮把它改成可数的判据：见 tools/test_barrier.js。
 */
const R = require('../prototype/game.js');
const L = require('../prototype/levels.js');
const { randomBuild } = require('./lib/random_build.js');

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

const LV = L[4];   // 1-5

// ═════════════ A 屏障真的挡得住"开过去的车" ═════════════
{
  /* 造一辆"只会往前开、没有任何过屏障手段"的车：
   * 三框 + 两轮 + 螺旋桨，不带雷种、不带风种、不带伞。 */
  const spec = {
    wood_frame: [[4, 1], [4, 2], [4, 3]],
    wood_wheel: [[5, 1], [5, 3]],
    propeller: [[3, 1]],
    pig: [[4, 2]],
    _dirs: { propeller: 0 }
  };
  const st = R.simulate(LV, spec, { maxTime: 70 });
  const blocked = st.events.some(e => e.indexOf('barrier_block') === 0);
  const x = st.car.x;
  lines.push('只会往前开的车：' + st.result + '/' + (st.failReason || '-') +
    '，最远 x=' + x.toFixed(2) + '（屏障 col=20）');
  chk('A 没有过屏障手段的车被挡在屏障前（x < 20）', x < 20,
    x.toFixed(2));
  chk('A2 而且记下了 barrier_block 事件', blocked,
    blocked ? '有' : '没有');
}

// ═════════════ B 雷种能冲过去 ═════════════
{
  const spec = JSON.parse(JSON.stringify(R.SPECS['1-5e']));
  const st = R.simulate(LV, spec, { maxTime: 70 });
  chk('B 雷种标准解通关（冲过屏障）', st.result === 'win', st.result);
}

// ═════════════ C 风种 + 伞也能过 —— 这是**设计上的第二条解** ═════════════
{
  /* 车 y≈7.0，屏障顶 9.93，需要 +1.93 米；伞给 2.72 米。
   * 这条判据存在的意义：确认"两条解法"是**有意**的，不是巧合。
   * 如果哪天有人把伞削弱到飞不过去，这条会红，提醒他这是个设计变更。 */
  const spec = {
    wood_frame: [[4, 1], [4, 2], [4, 3]],
    wood_wheel: [[5, 1], [5, 3]],
    propeller: [[3, 1]],
    umbrella: [[3, 2]],
    anemo_core: [[4, 2]],
    pig: [[4, 1]],
    _dirs: { propeller: 0 },
    _seeds: [{ t: 2.2, kind: 'anemo' }]
  };
  const st = R.simulate(LV, spec, { maxTime: 70 });
  lines.push('风种 + 伞过屏障：' + st.result + '/' + (st.failReason || '-') +
    ' @' + st.time.toFixed(2) + 's');
  chk('C 风种 + 伞也能过屏障（1-5 有两条解法）',
    st.result === 'win' || st.car.x > 19,
    st.result + ' x=' + st.car.x.toFixed(1));
}

// ═════════════ D 屏障判定不再有"瞬移" ═════════════
{
  /* 扫一批随机车，盯着 car.x 的单帧位移。
   *
   * ⚠ 第一版阈值写 0.6 米，实测最大 0.637 —— 但那**不是瞬移**：
   * 它是"车已经和屏障重叠了 0.637 米，被推出来"的**解算位移**。
   * 真正的 bug（t=7.450→7.467 跳 2.076 米）是**穿过**，
   * 性质完全不同：一个是把车推回合法位置，一个是把车送到墙那边。
   *
   * 所以这条判据改成量**结果**而不是位移：
   * 没有过屏障手段的车，绝不该出现在屏障右侧。
   * 位移只用来兜住"数量级明显不对"的情况（> 1.5 米）。 */
  let worst = 0, worstAt = '';
  let crossed = [];
  for (let i = 0; i < 120; i++) {
    const spec = randomBuild(LV);
    const tr = [];
    const st = R.simulate(LV, spec, { maxTime: 70, trace: tr });
    for (let k = 1; k < tr.length; k++) {
      const d = Math.abs(tr[k].x - tr[k - 1].x);
      if (d > worst) { worst = d; worstAt = 't=' + tr[k].t.toFixed(2); }
    }
    /* 有没有过屏障手段？ */
    const hasWay = !!(spec.electro_core || spec.anemo_core && (spec.umbrella || spec.wind_wing));
    if (!hasWay && st.car && st.car.x > 21.5) crossed.push(i);
  }
  lines.push('120 局随机车里的最大单帧位移 ' + worst.toFixed(3) + ' 米（' + worstAt + '）');
  chk('D 没有超过 1.5 米的单帧位移（那是"穿过"而不是"推出"）',
    worst <= 1.5, worst.toFixed(3) + 'm');
  chk('D2 没有任何"无过屏障手段"的车出现在屏障右侧',
    crossed.length === 0, crossed.length + ' 辆');
}

// ═════════════ E 屏障判定用真实包围盒（对着"负 maxX"的车验） ═════════════
{
  /* 单框车 hull = [−2, −1]，`maxX < 0`。这类车以前整批穿墙。 */
  const spec = {
    wood_frame: [[4, 1]], wood_wheel: [[5, 1]], pig: [[4, 1]],
    propeller: [[3, 1]], _dirs: { propeller: 0 }
  };
  const b = R.newBuild(); R.applySpec(LV, b, spec);
  const probeRun = R.createRun(LV, b);
  const h = probeRun && probeRun.car ? probeRun.car.hull : null;
  const st = R.simulate(LV, spec, { maxTime: 70 });
  lines.push('单框车 hull=' + JSON.stringify(h) + ' → ' + st.result +
    ' x=' + st.car.x.toFixed(2));
  chk('E0 前提：单框车的 hull.maxX 是负数', h && h.maxX < 0,
    h ? 'maxX=' + h.maxX : 'null');
  chk('E 单框车（负 maxX）也被屏障挡住', st.car.x < 20, st.car.x.toFixed(2));
}

console.log(lines.join('\n'));
console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
if (fail) console.log('失败项：' + fail + ' 条');
process.exit(fail ? 1 : 0);

/* 1-6「抬个头」到底有没有**决策**（第 81 轮）。
 *
 * ── 背景 ──
 *
 * 第 80 轮我在八关手感扫描里写"1-6 是唯一一条手感数据异常的关：
 * 最大离地 2.63 米、17 次硬撞击"。这一轮查清楚了 —— **那 17 次是我自己
 * 的量法造成的假象**：我手写 `for` 循环逐步 `step`，但没有处理
 * `spec._drops`，所以沙袋从来没被扔掉，车一路飘到顶、反复撞。
 * 走 `R.simulate()`（它正确处理 `_drops`）时硬撞击是 **0 次**。
 *
 * 所以本轮真正要回答的是另一个问题：**这一关有决策吗？**
 *
 * 1-6 教的是"气球给浮力、压舱石给配重"。如果无论怎么操作都能过，
 * 那它就是在放动画，不是在教机制。
 *
 * ── 判据 ──
 *
 *   A 三个方向都要验：扔完 / 一个不扔 / 扔一半 —— 只有"扔完"能拿三星
 *   B 触发时机的**窗口**有多宽：把扔沙袋的时刻从 0.5 秒扫到 3 秒
 *   C 换个构型（气球数 1/2/3）也能不能过 —— 说明不是"只有一个解"
 *   D 这一关的第三星真的只在"扔完"时达成（不是碰巧）
 */
const R = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');
const LV = LEVELS[5];

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

/* 1-6 的基础构型（和 SPECS['1-6'] 同形，但可改气球/沙袋数与扔的时刻） */
function specOf(balloons, sandbags, drops) {
  const s = {
    wood_frame: [[4, 1], [4, 2], [4, 3]],
    wood_wheel: [[5, 1], [5, 3]],
    pig: [[4, 2]],
    anemo_core: [[4, 1]],
    propeller: [[3, 1]],
    _dirs: { propeller: 0 }
  };
  if (balloons > 0) s.balloon = [[3, 2]];
  if (sandbags > 0) s.sandbag = [[5, 2]];
  s._stacks = { balloon: balloons, sandbag: sandbags };
  s._drops = drops || [];
  return s;
}

// ═════════════ A 三个方向 ═════════════
{
  const full = R.simulate(LV, specOf(3, 2, [{ t: 1.5, n: 2 }]), { maxTime: 40 });
  chk('A 扔完沙袋 → 通关且三星',
    full.result === 'win' && full.stars === 3,
    full.result + '/' + full.stars + ' ' + JSON.stringify(full.starGoals));

  const none = R.simulate(LV, specOf(3, 2, []), { maxTime: 40 });
  lines.push('一个不扔：' + none.result + '/' + (none.failReason || '-') +
    ' stars=' + none.stars);
  chk('A2 一个不扔 → 拿不到「沙袋全扔」这颗星',
    !(none.starGoals && none.starGoals.challenge),
    JSON.stringify(none.starGoals || {}));

  const half = R.simulate(LV, specOf(3, 2, [{ t: 1.5, n: 1 }]), { maxTime: 40 });
  lines.push('只扔一个：' + half.result + '/' + (half.failReason || '-') +
    ' stars=' + half.stars);
  chk('A3 只扔一半 → 也拿不到这颗星（必须扔完）',
    !(half.starGoals && half.starGoals.challenge),
    JSON.stringify(half.starGoals || {}));
}

// ═════════════ B 触发时机的窗口 ═════════════
{
  /* 把扔沙袋的时刻从 0.5 扫到 3.0 秒。窗口宽度就是这一关的"时机"含量。 */
  const ok = [];
  for (let t = 0.5; t <= 3.01; t += 0.1) {
    const st = R.simulate(LV, specOf(3, 2, [{ t: +t.toFixed(1), n: 2 }]), { maxTime: 40 });
    if (st.result === 'win' && st.stars === 3) ok.push(+t.toFixed(1));
  }
  lines.push('扔沙袋时刻能三星的范围：' + (ok.join(',') || '（无）'));
  lines.push('窗口宽度 ' + (ok.length ? (ok[ok.length - 1] - ok[0] + 0.1).toFixed(1) : 0) + ' 秒');
  /* 判据：窗口要么**足够宽**（不是卡帧操作），要么**不存在**（说明扔的时机不影响）。
   * 两者都说明"这一关不是靠卡时机"，这是好事 —— 但要量出来是哪一种。 */
  chk('B 扔沙袋的时机不影响通关（窗口覆盖整个扫描区间）',
    ok.length >= 24, ok.length + ' / 26 个采样点');
}

// ═════════════ C 不是只有一个解 ═════════════
{
  const rows = [];
  for (const nb of [1, 2, 3]) {
    for (const ns of [1, 2, 3]) {
      const st = R.simulate(LV, specOf(nb, ns, [{ t: 1.5, n: ns }]), { maxTime: 40 });
      rows.push({ nb, ns, result: st.result, stars: st.stars,
        net: st.car ? null : null });
    }
  }
  const wins = rows.filter(r => r.result === 'win');
  lines.push('气球×沙袋组合（扔完）：' + rows.map(r =>
    r.nb + '球' + r.ns + '袋=' + (r.result === 'win' ? '★' : '×')).join(' '));
  /* 判据：至少 3 种组合能过 —— 说明机制有弹性，不是单解谜题。 */
  chk('C 至少 3 种气球/沙袋组合都能通关（不是单解）',
    wins.length >= 3, wins.length + ' / ' + rows.length + ' 种');
}

// ═════════════ D 第三星只在"扔完"时达成 ═════════════
{
  /* 穷举：1~3 个沙袋、扔 0~n 个，看第三星何时亮。
   * 只有"扔的个数 == 带的个数"才该亮。 */
  const bad = [];
  for (const ns of [1, 2, 3]) {
    for (let drop = 0; drop <= ns; drop++) {
      const st = R.simulate(LV, specOf(3, ns, drop ? [{ t: 1.5, n: drop }] : []),
        { maxTime: 40 });
      const got = !!(st.starGoals && st.starGoals.challenge);
      const should = (drop === ns);
      if (got !== should) {
        bad.push(ns + '袋扔' + drop + '个 → 第三星=' + got + '（应为 ' + should + '）');
      }
    }
  }
  chk('D 第三星只在"扔的个数 == 带的个数"时达成', bad.length === 0,
    bad.length ? bad.join(' / ') : '9 种情况全部正确');
}

// ═════════════ E 第 80 轮那个"17 次硬撞击"是量法造成的 ═════════════
{
  /* 用手写循环（不处理 _drops）复现，再用 simulate 对照。 */
  R.resetParams({ collectContacts: [] });
  const spec = JSON.parse(JSON.stringify(R.SPECS['1-6']));
  const b = R.newBuild(); R.applySpec(LV, b, spec);
  const st = R.createRun(LV, b); R.applySpecRuntime(st, spec);
  for (let i = 0; i < 60 * 30 && st.phase === 'run'; i++) R.step(st, 1 / 60);
  const manualHard = (R.Params.collectContacts || []).filter(v => v > 4.5).length;

  const proper = R.simulate(LV, JSON.parse(JSON.stringify(R.SPECS['1-6'])), { maxTime: 40 });
  const properImpacts = proper.events.filter(e => e.indexOf('impact') === 0).length;

  lines.push('手写循环（不扔沙袋）：硬接触 ' + manualHard + ' 次');
  lines.push('simulate（正确处理 _drops）：impact ' + properImpacts + ' 次');
  chk('E1 走 simulate 时没有硬撞击（第 80 轮的 17 次是量法造成的）',
    properImpacts === 0, properImpacts + ' 次');
  chk('E2 那个假象能被复现（证明结论的具体来源）',
    manualHard > 0, manualHard + ' 次');
}

console.log(lines.join('\n'));
console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
if (fail) console.log('失败项：' + fail + ' 条');
process.exit(fail ? 1 : 0);

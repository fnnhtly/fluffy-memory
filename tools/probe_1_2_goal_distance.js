/* 1-2 第四版：保留原下坡，只把终点搬到"滑不到"的地方。
 *
 * 前几版的教训：
 *   - 台阶/深坑版能让打气筒变必需，但按下窗口只有 0.5~0.6 秒 → 教的是卡帧，不是打气筒。
 *   - 平地版窗口极宽（19/19），但会让 1-2 完全失去运动，连带影响"接触反馈/轮子转动"那几条测试。
 *
 * 所以最省的改法可能是：**地形一个字都不动，只把终点往前挪**。
 * 车靠下坡滑到某个距离就停了（实测 col 12 恰好能滑到），
 * 那就把终点放到滑不到的地方 —— 不按永远差一点，按一下就够。
 * 这样"什么时候按"完全自由（只要还在动），而且地形、材质、坡全都保留。
 *
 * 本脚本量：滑行极限距离、各终点距离的成败、按下时机的窗口宽度。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');

const BASE = L[1];
const COLS = BASE.grid.cols;

function withGoal(col, row) {
  const lv = JSON.parse(JSON.stringify(BASE));
  lv.goal = { col: col, row: row === undefined ? 7 : row };
  // 保证终点格是空的（有点就在点位上放 E 的行为由 mapRows 决定，这里改 mapRows）
  const g = lv.mapRows.map(r => r.split(''));
  // 清掉所有旧的 E
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] === 'E') g[r][c] = '.';
  const rr = lv.goal.row, cc = col;
  if (rr >= 0 && rr < g.length && cc >= 0 && cc < g[rr].length) g[rr][cc] = 'E';
  lv.mapRows = g.map(r => r.join(''));
  lv.boxes = [];
  lv.challenge = { type: 'none' };
  return lv;
}

function simulate(lv, spec, dir, presses, maxT) {
  RAP.resetParams({});
  const b = RAP.newBuild();
  RAP.applySpec(lv, b, spec);
  const st = RAP.createRun(lv, b);
  if (dir !== null && dir !== undefined) {
    st.car.parts.filter(p => p.def === RAP.PARTS.pump).forEach(p => { p.dir = dir; });
  }
  st.spawnGrace = 0.9;
  const dt = 1 / 60;
  const acts = (presses || []).slice().sort((a, b2) => a.t - b2.t);
  let ai = 0;
  let maxX = -1e9;
  while (st.phase === 'run' && st.time < (maxT || 25)) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      if (acts[ai].kind === 'press') RAP.pressInteract(st, 1);
      else RAP.releaseInteract(st, 1);
      ai++;
    }
    RAP.step(st, dt);
    if (st.car) maxX = Math.max(maxX, st.car.x);
  }
  return { result: st.result || '未结束', reason: st.failReason || '', time: st.time,
           maxX: maxX === -1e9 ? null : maxX };
}

const FRAMES = { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]] };

console.log('== 不装打气筒：滑行极限 ==');
{
  const r = simulate(withGoal(30), FRAMES, null, [], 25);
  console.log('  最远滑到 x=' + (r.maxX === null ? '—' : r.maxX.toFixed(2)) +
    '（col ' + (r.maxX ? r.maxX.toFixed(1) : '?') + '）  结果 ' + r.result + ' (' + r.reason + ')');
}

console.log('\n== 终点距离 vs 是否需要打气筒（1 个朝右，@0.8s 按住 0.6s）==');
const P1 = Object.assign({}, FRAMES, { pump: [[3, 2]] });
for (let col = 12; col <= 22; col += 1) {
  const lv = withGoal(col);
  const noPress = simulate(lv, FRAMES, null, []);
  const onePress = simulate(lv, P1, 0,
    [{ t: 0.8, kind: 'press' }, { t: 1.4, kind: 'release' }]);
  console.log('  col ' + String(col).padStart(2) +
    '  不按 ' + noPress.result.padEnd(5) +
    '  按一下 ' + onePress.result.padEnd(5) + ' t=' + onePress.time.toFixed(2));
}

console.log('\n== 选定 col 16：按下时机窗口（朝右，按住 0.6s）==');
{
  const lv = withGoal(16);
  const P1 = Object.assign({}, FRAMES, { pump: [[3, 2]] });
  const ok = [];
  for (let t0 = 0.2; t0 <= 4.0; t0 += 0.2) {
    const r = simulate(lv, P1, 0, [{ t: t0, kind: 'press' }, { t: t0 + 0.6, kind: 'release' }]);
    if (r.result === 'win') ok.push(t0);
  }
  console.log('  朝右：' + ok.length + '/20 成功' + (ok.length ? '，窗口 ' + ok[0].toFixed(1) + '~' + ok[ok.length - 1].toFixed(1) + 's' : ''));
  // 朝上也试一下（玩家可能装反）
  const ok2 = [];
  for (let t0 = 0.2; t0 <= 4.0; t0 += 0.2) {
    const r = simulate(lv, P1, 1, [{ t: t0, kind: 'press' }, { t: t0 + 0.6, kind: 'release' }]);
    if (r.result === 'win') ok2.push(t0);
  }
  console.log('  朝上：' + ok2.length + '/20 成功（装反了也该有点希望）');
  // 不装 / 装了不按
  console.log('  不装   → ' + simulate(lv, FRAMES, null, []).result);
  console.log('  装了不按 → ' + simulate(lv, P1, null, []).result);
}

/* 1-2 定稿标定：终点挪到 col 15，一次喷气刚好够。
 *
 * 从 probe_1_2_goal_distance.js 的实测矩阵里挑出来的唯一干净区间：
 *   不按打气筒 → 最远只滑到 x=13.26（col 13.3），永远 stuck
 *   col 14 / 15：不按 fail，按一下 win
 *   col 16 起：按一下也不够（要多按几次）
 *
 * 这比"改地形"省得多，而且保住了 1-2 原本那条下坡 —— 车是滚起来的，
 * 不是平地起步，玩家能看到"轮子在动、车在走"，
 * 打气筒的作用是"最后推一把越过那道线"，正合关卡名「按一下」。
 *
 * 本脚本要量准三件事，才能写进 levels/02.json：
 *   1. 时机的容错宽度（col 15 比 col 14 更靠边，要确认不是只有 3/20）
 *   2. 按住时长的容错
 *   3. 通关时间分布 → 定「★★★ 只按一下」的 pumpPress 上限，
 *      以及要不要换成「限时」
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');

const BASE = L[1];

function withGoal(col, row) {
  const lv = JSON.parse(JSON.stringify(BASE));
  const g = lv.mapRows.map(r => r.split(''));
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] === 'E') g[r][c] = '.';
  const rr = row === undefined ? 7 : row;
  if (rr >= 0 && rr < g.length && col < g[rr].length) g[rr][col] = 'E';
  lv.mapRows = g.map(r => r.join(''));
  lv.goal = { col: col, row: rr };
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
  while (st.phase === 'run' && st.time < (maxT || 25)) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      if (acts[ai].kind === 'press') RAP.pressInteract(st, 1);
      else RAP.releaseInteract(st, 1);
      ai++;
    }
    RAP.step(st, dt);
  }
  return { result: st.result || '未结束', reason: st.failReason || '', time: st.time,
           presses: st.pumpPress };
}

const FRAMES = { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]] };
const P1 = Object.assign({}, FRAMES, { pump: [[3, 2]] });
const P2 = Object.assign({}, FRAMES, { pump: [[3, 1], [3, 3]] });

function windowScan(lv, spec, dir, hold, step) {
  const ok = [];
  const all = [];
  for (let t0 = 0.2; t0 <= 4.0; t0 += (step || 0.1)) {
    const r = simulate(lv, spec, dir, [{ t: t0, kind: 'press' }, { t: t0 + hold, kind: 'release' }]);
    all.push([t0, r.result, r.time]);
    if (r.result === 'win') ok.push(t0);
  }
  return { ok, all };
}

function report(col) {
  const lv = withGoal(col);
  console.log('\n=== 终点 col ' + col + ' ===');
  console.log('  不装     → ' + simulate(lv, FRAMES, null, []).result);
  console.log('  装了不按 → ' + simulate(lv, P1, null, []).result);
  [0.4, 0.6, 0.8].forEach(hold => {
    const w = windowScan(lv, P1, 0, hold, 0.1);
    console.log('  按住 ' + hold.toFixed(1) + 's 朝右 → ' + w.ok.length + '/39 成功' +
      (w.ok.length ? '，窗口 ' + w.ok[0].toFixed(1) + '~' + (w.ok[w.ok.length - 1]).toFixed(1) + 's' : ''));
  });
  // 按住时长的容错：@1.0s 起
  const holds = [];
  for (let h = 0.1; h <= 1.2; h += 0.1) {
    const r = simulate(lv, P1, 0, [{ t: 1.0, kind: 'press' }, { t: 1.0 + h, kind: 'release' }]);
    if (r.result === 'win') holds.push(h);
  }
  console.log('  @1.0s 起按：够用的按住时长 ' + (holds.length ? holds[0].toFixed(1) + '~' + holds[holds.length - 1].toFixed(1) + 's' : '无'));
  // 两下
  const two = simulate(lv, P2, 0, [
    { t: 0.6, kind: 'press' }, { t: 1.2, kind: 'release' },
    { t: 1.6, kind: 'press' }, { t: 2.2, kind: 'release' }
  ]);
  console.log('  2 个打气筒按一次 → ' + two.result + ' t=' + two.time.toFixed(2));
  // 时间分布
  const times = [];
  for (let t0 = 0.4; t0 <= 2.6; t0 += 0.2) {
    const r = simulate(lv, P1, 0, [{ t: t0, kind: 'press' }, { t: t0 + 0.7, kind: 'release' }]);
    if (r.result === 'win') times.push(r.time);
  }
  times.sort((a, b) => a - b);
  if (times.length) {
    console.log('  通关时间：最快 ' + times[0].toFixed(2) + '  中位 ' +
      times[Math.floor(times.length / 2)].toFixed(2) + '  最慢 ' + times[times.length - 1].toFixed(2));
  }
}

report(14);
report(15);

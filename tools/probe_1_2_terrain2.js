/* 1-2 地形实验（第二版）：在**原始地形**上改，而不是另起平地。
 *
 * 第一版（probe_1_2_terrain.js）从平地开始，结果所有组合都 fail：
 * 平地 + 没有马达 = 车根本不动。这暴露了一件事 —— 1-2 之所以能"不按也过"，
 * 是因为它有一条下坡，车靠重力自己滚到了终点。
 *
 * 所以要让打气筒成为必需品，只有两种改法：
 *   A. 把下坡之后的地面挖深 / 抬高到"靠滚动的余速上不去"
 *   B. 让终点在一个需要越过缺口的位置
 *
 * 这个脚本在原始 mapRows 上做 A/B 两种改动并打印成败。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');

const BASE = L[1];
const COLS = BASE.grid.cols, ROWS = BASE.grid.rows;

function clone(rows, goal, extra) {
  const lv = JSON.parse(JSON.stringify(BASE));
  lv.mapRows = rows;
  if (goal) lv.goal = goal;
  lv.boxes = [];
  lv.challenge = { type: 'none' };
  Object.assign(lv, extra || {});
  return lv;
}

function grid(rows) {
  const g = rows.map(r => r.split(''));
  while (g.length < ROWS) g.push(new Array(COLS).fill('.'));
  return g;
}
const toRows = g => g.map(r => r.join(''));

function simulate(level, spec, dir, presses) {
  RAP.resetParams({});
  const b = RAP.newBuild();
  RAP.applySpec(level, b, spec);
  const st = RAP.createRun(level, b);
  if (dir !== null && dir !== undefined) {
    st.car.parts.filter(p => p.def === RAP.PARTS.pump).forEach(p => { p.dir = dir; });
  }
  st.spawnGrace = 0.9;
  const dt = 1 / 60;
  const acts = (presses || []).slice().sort((a, b2) => a.t - b2.t);
  let ai = 0;
  while (st.phase === 'run' && st.time < 40) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      if (acts[ai].kind === 'press') RAP.pressInteract(st, 1);
      else RAP.releaseInteract(st, 1);
      ai++;
    }
    RAP.step(st, dt);
  }
  return { result: st.result || '未结束', reason: st.failReason || '', time: st.time,
           x: st.car ? st.car.x : null, y: st.car ? st.car.y : null };
}

const FRAMES = { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]] };
const P1 = Object.assign({}, FRAMES, { pump: [[3, 2]] });

// 先看清原始地形为什么能过
console.log('原始 1-2 地形：');
const orig = simulate(clone(BASE.mapRows), FRAMES, null, []);
console.log('  不装 = ' + orig.result + ' ' + orig.reason + ' t=' + orig.time.toFixed(1) +
  ' x=' + (orig.x === null ? '—' : orig.x.toFixed(1)));

// ---------- A. 把 col 10..13 那一段地面整体抬高 H 格（车要爬上去） ----------
console.log('\n== A. 终点所在平台抬高 H 格（col 10 起）==');
[1, 2].forEach(H => {
  const g = grid(BASE.mapRows);
  for (let c = 10; c < COLS; c++) {
    for (let r = 7; r >= 7 - H + 1; r--) if (r >= 0) g[r][c] = '#';
  }
  const rows = toRows(g);
  [['不装', FRAMES, null], ['装了不按', P1, null],
   ['1个朝上', P1, 1]].forEach(([tag, spec, dir]) => {
    const presses = dir === null ? [] : [{ t: 1.0, kind: 'press' }, { t: 1.7, kind: 'release' }];
    const r = simulate(clone(rows, { col: 12, row: 7 - H }, { hardCols: [10] }), spec, dir, presses);
    console.log('  H=' + H + ' ' + tag.padEnd(9) + r.result.padEnd(5) + (r.reason ? '(' + r.reason + ')' : '').padEnd(10) +
      ' t=' + r.time.toFixed(1).padStart(5) + ' x=' + (r.x === null ? '—' : r.x.toFixed(1)));
  });
});

// ---------- B. col 6..9 的坑挖深 D 格 ----------
console.log('\n== B. 中段坑挖深 D 格（col 6..9）==');
[1, 2, 3].forEach(D => {
  const g = grid(BASE.mapRows);
  for (let c = 6; c <= 9; c++) { for (let r = 7; r < 7 + D; r++) if (r < ROWS) g[r][c] = '.'; }
  const rows = toRows(g);
  [['不装', FRAMES, null], ['装了不按', P1, null],
   ['1个朝上', P1, 1], ['2个朝上', Object.assign({}, FRAMES, { pump: [[3, 1], [3, 3]] }), 1]].forEach(([tag, spec, dir]) => {
    const presses = dir === null ? [] : [{ t: 0.9, kind: 'press' }, { t: 1.6, kind: 'release' }];
    const r = simulate(clone(rows, { col: 12, row: 7 }), spec, dir, presses);
    console.log('  D=' + D + ' ' + tag.padEnd(9) + r.result.padEnd(5) + (r.reason ? '(' + r.reason + ')' : '').padEnd(10) +
      ' t=' + r.time.toFixed(1).padStart(5) + ' x=' + (r.x === null ? '—' : r.x.toFixed(1)));
  });
});

// ---------- C. 把目标移到高处：col 12 上方留空，E 在 row 4 ----------
console.log('\n== C. 终点悬在 row4（必须飞上去）==');
{
  const g = grid(BASE.mapRows);
  for (let c = 10; c < COLS; c++) for (let r = 4; r <= 7; r++) g[r][c] = '#';
  const rows = toRows(g);
  [['不装', FRAMES, null], ['1个朝上', P1, 1], ['2个朝上', Object.assign({}, FRAMES, { pump: [[3, 1], [3, 3]] }), 1]]
    .forEach(([tag, spec, dir]) => {
      const presses = dir === null ? [] : [{ t: 1.0, kind: 'press' }, { t: 1.8, kind: 'release' }];
      const r = simulate(clone(rows, { col: 12, row: 4 }, { hardCols: [10] }), spec, dir, presses);
      console.log('  ' + tag.padEnd(9) + r.result.padEnd(5) + (r.reason ? '(' + r.reason + ')' : '').padEnd(10) +
        ' t=' + r.time.toFixed(1).padStart(5) + ' x=' + (r.x === null ? '—' : r.x.toFixed(1)));
    });
}

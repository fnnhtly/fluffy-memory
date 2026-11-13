/* 1-2「按一下」的关卡体检：打气筒到底是不是必需品。
 *
 * 起因：跑标准解时 pumpPress = 0，也就是说**一次都没按**就通关了。
 * 一关叫「按一下」，却不按也能过，那这一关存在的意义就没了 ——
 * 玩家学不到"打气筒是干什么的"，后面 1-3 之后的关卡也就没有铺垫。
 *
 * 这个脚本做两件事：
 *   1. 量当前 1-2：不装打气筒 / 装了但不按 / 装了并且按 —— 三种结果
 *   2. 试几个候选地形，找一个"必须按才过得去"的版本，把出参打出来
 *
 * simulate() 不支持脚本化输入，所以这里手动 createRun + step + pressInteract。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');

const FRAMES = { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]] };
const WITH_PUMP = Object.assign({}, FRAMES, { pump: [[3, 2]] });

/** 跑一次，ac 是 [{t, fn}] 形式的动作表（t 单位秒，到了就执行）。 */
function run(level, spec, ac, maxT) {
  RAP.resetParams({});
  const b = RAP.newBuild();
  RAP.applySpec(level, b, spec);
  const st = RAP.createRun(level, b);
  st.spawnGrace = 0.9;
  const dt = 1 / 60;
  let ai = 0;
  const acts = (ac || []).slice().sort((x, y) => x.t - y.t);
  while (st.phase === 'run' && st.time < (maxT || 70)) {
    while (ai < acts.length && acts[ai].t <= st.time) { acts[ai].fn(st); ai++; }
    RAP.step(st, dt);
  }
  return st;
}

function line(tag, st) {
  const x = st.car ? st.car.x : (st.result === 'win' ? '到终点' : '—');
  console.log('  ' + tag.padEnd(22) + (st.result || '未结束').padEnd(6) +
    't=' + st.time.toFixed(2).padStart(6) +
    '  x=' + (typeof x === 'number' ? x.toFixed(1) : x) +
    '  pumpPress=' + st.pumpPress +
    '  ★' + st.stars + ' ' + JSON.stringify(st.starGoals || {}));
  return st;
}

const lv = L[1];
console.log('当前 1-2（goal col=' + lv.goal.col + ', row=' + lv.goal.row + '）');
line('不装打气筒', run(lv, FRAMES));
line('装了但不按', run(lv, WITH_PUMP));
// 装了并且在不同时间点按一下（按住 0.5s 再松）
const tries = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
tries.forEach(t0 => {
  line('按一下 @' + t0.toFixed(1) + 's', run(lv, WITH_PUMP, [
    { t: t0, fn: s => RAP.pressInteract(s, 1) },
    { t: t0 + 0.5, fn: s => RAP.releaseInteract(s, 1) }
  ]));
});

// ---------- 候选地形 ----------
function rowsFrom(base, paint) {
  const cols = base.grid.cols, rows = base.grid.rows;
  const g = Array.from({ length: rows }, () => new Array(cols).fill('.'));
  paint((r, c, ch) => { if (r >= 0 && r < rows && c >= 0 && c < cols) g[r][c] = ch; }, g);
  return g.map(r => r.join(''));
}
function cloneWith(rows, goal, extra) {
  const lv2 = JSON.parse(JSON.stringify(lv));
  lv2.mapRows = rows;
  lv2.goal = goal;
  Object.assign(lv2, extra || {});
  return lv2;
}

console.log('\n候选地形（打气筒朝下、按一下能跳起来）：');
const cols = lv.grid.cols;
// 候选 A：地面 row8 到头，col 9-10 立一堵高 3 米的墙（row5..7），目标在墙顶
const A = rowsFrom(lv, put => {
  put(4, 1, 'S');
  for (let c = 0; c < cols; c++) for (let r = 8; r < 14; r++) put(r, c, '#');
  for (let r = 5; r <= 7; r++) { put(r, 9, '#'); put(r, 10, '#'); }
  for (let r = 5; r <= 7; r++) for (let c = 11; c < 20; c++) put(r, c, '#');
  put(7, 6, 'B');
  put(4, 14, 'E');
});
const lvA = cloneWith(A, { col: 14, row: 4 }, { hardCols: [9] });
line('A 不装打气筒', run(lvA, FRAMES));
line('A 装了不按', run(lvA, WITH_PUMP));
[1.2, 1.6, 2.0, 2.4].forEach(t0 => {
  line('A 按 @' + t0.toFixed(1) + 's', run(lvA, WITH_PUMP, [
    { t: t0, fn: s => RAP.pressInteract(s, 1) },
    { t: t0 + 0.6, fn: s => RAP.releaseInteract(s, 1) }
  ]));
});

// 候选 B：目标抬到 2 米高的台子上（col 9 起 row6）
const B = rowsFrom(lv, put => {
  put(4, 1, 'S');
  for (let c = 0; c < cols; c++) for (let r = 8; r < 14; r++) put(r, c, '#');
  for (let r = 6; r <= 7; r++) for (let c = 9; c < cols; c++) put(r, c, '#');
  put(7, 6, 'B');
  put(4, 14, 'E');
});
const lvB = cloneWith(B, { col: 14, row: 4 }, { hardCols: [9] });
line('B 不装打气筒', run(lvB, FRAMES));
line('B 装了不按', run(lvB, WITH_PUMP));
[1.0, 1.4, 1.8].forEach(t0 => {
  line('B 按 @' + t0.toFixed(1) + 's', run(lvB, WITH_PUMP, [
    { t: t0, fn: s => RAP.pressInteract(s, 1) },
    { t: t0 + 0.6, fn: s => RAP.releaseInteract(s, 1) }
  ]));
});

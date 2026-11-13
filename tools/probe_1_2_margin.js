/* 1-2 的两个候选方案对比：「1 格台阶」vs「2 格深坑」。
 *
 * 从 probe_1_2_terrain2.js 看，两者都能做到"不按过不去、按了能过"：
 *   台阶 H=1：不装 fail / 装了不按 fail / 1 个朝上 win（t=2.8）
 *   深坑 D=2：不装 fail / 装了不按 fail / 1 个朝上 win（t=2.6）
 *
 * 但"能过"不够 —— 教学关必须**容错**。如果只有在 1.2~1.6s 这个 0.4 秒窗口里按
 * 才过得去，玩家学到的是"这游戏要求精确到帧"，而不是"打气筒能把我顶上去"。
 *
 * 所以这里量化两件事：
 *   1. 按下时机的成功窗口有多宽
 *   2. 按住时长是否也需要精确（那就更糟）
 *
 * 结论会直接决定 1-2 用哪一套地形。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');

const BASE = L[1];
const COLS = BASE.grid.cols, ROWS = BASE.grid.rows;

function gridOf(rows) {
  const g = rows.map(r => r.split(''));
  while (g.length < ROWS) g.push(new Array(COLS).fill('.'));
  return g;
}
const toRows = g => g.map(r => r.join(''));

/** 方案 A：col 10 起抬高 H 格（1 格硬台阶） */
function planStep(H) {
  const g = gridOf(BASE.mapRows);
  for (let c = 10; c < COLS; c++) {
    for (let r = 6; r <= 7; r++) g[r][c] = '#';
  }
  const lv = JSON.parse(JSON.stringify(BASE));
  lv.mapRows = toRows(g);
  lv.goal = { col: 12, row: 6 };
  lv.hardCols = [10];
  lv.boxes = [];
  lv.challenge = { type: 'none' };
  return lv;
}

/** 方案 B：col 6..9 挖深 D 格 */
function planPit(D) {
  const g = gridOf(BASE.mapRows);
  for (let c = 6; c <= 9; c++) {
    for (let r = 7; r < 7 + D; r++) if (r < ROWS) g[r][c] = '.';
  }
  const lv = JSON.parse(JSON.stringify(BASE));
  lv.mapRows = toRows(g);
  lv.goal = { col: 12, row: 7 };
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
  while (st.phase === 'run' && st.time < (maxT || 40)) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      if (acts[ai].kind === 'press') RAP.pressInteract(st, 1);
      else RAP.releaseInteract(st, 1);
      ai++;
    }
    RAP.step(st, dt);
  }
  return { result: st.result || '未结束', reason: st.failReason || '', time: st.time };
}

const FRAMES = { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]] };
const P1 = Object.assign({}, FRAMES, { pump: [[3, 2]] });

function window4(lv, dirAt, hold, tag) {
  const ok = [];
  const tried = [];
  for (let t0 = 0; t0 <= 3.0; t0 += 0.1) {
    tried.push(t0);
    const r = simulate(lv, P1, dirAt, [{ t: t0, kind: 'press' }, { t: t0 + hold, kind: 'release' }]);
    if (r.result === 'win') ok.push(t0);
  }
  const pct = (100 * ok.length / tried.length).toFixed(0);
  console.log('  ' + tag.padEnd(26) + ok.length + '/' + tried.length + ' 成功 (' + pct + '%)' +
    (ok.length ? '  窗口 ' + ok[0].toFixed(1) + '~' + ok[ok.length - 1].toFixed(1) + 's' : '  全部失败'));
  return ok;
}

function holdScan(lv, dirAt, t0, tag) {
  const ok = [];
  const tried = [];
  for (let h = 0.1; h <= 1.0; h += 0.1) {
    tried.push(h);
    const r = simulate(lv, P1, dirAt, [{ t: t0, kind: 'press' }, { t: t0 + h, kind: 'release' }]);
    if (r.result === 'win') ok.push(h);
  }
  console.log('  ' + tag.padEnd(26) + ok.length + '/' + tried.length + ' 成功' +
    (ok.length ? '  够用的按住时长 ' + ok[0].toFixed(1) + '~' + ok[ok.length - 1].toFixed(1) + 's' : ''));
  return ok;
}

const A = planStep(1);
const B = planPit(2);

console.log('== 方案 A：1 格硬台阶 ==');
console.log('  不按 → ' + simulate(A, P1, null, []).result);
window4(A, 1, 0.6, '朝上，按住 0.6s');
window4(A, 1, 0.8, '朝上，按住 0.8s');
window4(A, 1, 0.3, '朝上，按住 0.3s');
holdScan(A, 1, 1.5, '@1.5s 起按住');

console.log('\n== 方案 B：2 格深坑 ==');
console.log('  不按 → ' + simulate(B, P1, null, []).result);
window4(B, 1, 0.6, '朝上，按住 0.6s');
window4(B, 1, 0.8, '朝上，按住 0.8s');
holdScan(B, 1, 1.3, '@1.3s 起按住');

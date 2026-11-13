/* 给 1-2 找一个"不按打气筒就过不去"的地形。
 *
 * 已知（tools/probe_pump_power.js 实测）：
 *   1 个朝上、满蓄力 → 抬升 0.85 m（不到 1 格）
 *   2 个朝上、满蓄力 → 抬升约 4 m（v↑ 11.9，已接近 maxSpeed=12 限速）
 *   1 个朝右、满蓄力 → 水平 9 m
 *   按住越久蓄力越大：0.05s→v↑2.3，0.4s→4.1，0.8s→6.0
 *
 * 所以候选思路只有两种：
 *   A. 一堵 1~2 格高的硬台阶，必须朝上喷才上得去
 *   B. 一个坑/缺口，必须朝右喷才飞得过去
 *
 * 这个脚本把两种都扫一遍，输出"不按"和"按"的成败矩阵，
 * 好让关卡设计建立在实测上，而不是"我觉得应该能上去"。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');

const COLS = 44, ROWS = 14;

function makeLevel(paint, goal) {
  const g = Array.from({ length: ROWS }, () => new Array(COLS).fill('.'));
  const put = (r, c, ch) => { if (r >= 0 && r < ROWS && c >= 0 && c < COLS) g[r][c] = ch; };
  g[4][1] = 'S';
  for (let c = 0; c < COLS; c++) for (let r = 8; r < ROWS; r++) g[r][c] = '#';
  paint(put);
  g[goal.row][goal.col] = 'E';
  const lv = JSON.parse(JSON.stringify(L[1]));
  lv.mapRows = g.map(r => r.join(''));
  lv.goal = { col: goal.col, row: goal.row };
  lv.materials = [{ surfaceRow: 8, cols: [0, COLS - 1], type: 'mud' }];
  lv.boxes = [];
  lv.partsBox = { wood_frame: 4, wood_wheel: 2, pump: 4, pig: 1 };
  lv.challenge = { type: 'none' };
  return lv;
}

/** 跑到结束，返回 {result, time, x} */
function simulate(level, spec, pressDir, presses) {
  RAP.resetParams({});
  const b = RAP.newBuild();
  RAP.applySpec(level, b, spec);
  const st = RAP.createRun(level, b);
  if (pressDir !== null) {
    st.car.parts.filter(p => p.def === RAP.PARTS.pump).forEach(p => { p.dir = pressDir; });
  }
  st.spawnGrace = 0.9;
  const dt = 1 / 60;
  const acts = (presses || []).slice().sort((a, b2) => a.t - b2.t);
  let ai = 0;
  while (st.phase === 'run' && st.time < 40) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      const a = acts[ai];
      if (a.kind === 'press') RAP.pressInteract(st, 1);
      else RAP.releaseInteract(st, 1);
      ai++;
    }
    RAP.step(st, dt);
  }
  return { result: st.result || '未结束', time: st.time, x: st.car ? st.car.x : null };
}

const FRAMES = { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]] };
const P1 = Object.assign({}, FRAMES, { pump: [[3, 2]] });
const P2 = Object.assign({}, FRAMES, { pump: [[3, 1], [3, 3]] });
const NO = FRAMES;

// ---------- A. 硬台阶：col W 起抬高 H 格 ----------
console.log('== A. 硬台阶（col 9 起抬高 H 格，目标在台阶上）==');
[1, 2, 3].forEach(H => {
  const lv = makeLevel(put => {
    for (let c = 9; c < COLS; c++) for (let r = 8 - H; r <= 7; r++) put(r, c, '#');
  }, { col: 16, row: 8 - H - 4 });
  lv.hardCols = [9];
  [['不装', NO, null], ['装了不按', P1, null],
   ['1个朝上', P1, 1], ['2个朝上', P2, 1]].forEach(([tag, spec, dir]) => {
    const presses = dir === null ? [] : [{ t: 1.2, kind: 'press' }, { t: 2.0, kind: 'release' }];
    const r = simulate(lv, spec, dir, presses);
    console.log('  H=' + H + ' ' + tag.padEnd(9) + r.result.padEnd(5) +
      ' t=' + r.time.toFixed(1).padStart(5) + ' x=' + (r.x === null ? '—' : r.x.toFixed(1)));
  });
});

// ---------- B. 缺口：col 9..12 整体下沉 D 格 ----------
console.log('\n== B. 缺口（col 9..12 下沉 D 格）==');
[2, 3, 4].forEach(D => {
  const lv = makeLevel(put => {
    for (let c = 9; c <= 12; c++) for (let r = 8 + D; r < ROWS; r++) put(r, c, '#');
    for (let c = 9; c <= 12; c++) for (let r = 8; r < 8 + D; r++) put(r, c, '.');
  }, { col: 20, row: 4 });
  [['不装', NO, null], ['装了不按', P1, null],
   ['1个朝右', P1, 0], ['1个朝上', P1, 1]].forEach(([tag, spec, dir]) => {
    const presses = dir === null ? [] : [{ t: 1.5, kind: 'press' }, { t: 2.3, kind: 'release' }];
    const r = simulate(lv, spec, dir, presses);
    console.log('  D=' + D + ' ' + tag.padEnd(9) + r.result.padEnd(5) +
      ' t=' + r.time.toFixed(1).padStart(5) + ' x=' + (r.x === null ? '—' : r.x.toFixed(1)));
  });
});

// ---------- C. 高台 + 缺口组合：先低地，然后 1 格台阶，再上平台 ----------
console.log('\n== C. 1 格硬台阶（不做平滑，纯垂直）==');
[1, 2].forEach(H => {
  const lv = makeLevel(put => {
    for (let c = 12; c < COLS; c++) for (let r = 8 - H; r <= 7; r++) put(r, c, '#');
  }, { col: 18, row: 8 - H - 4 });
  lv.hardCols = [12];
  [['不装', NO, null], ['1个朝上', P1, 1], ['2个朝上', P2, 1], ['3个朝上', Object.assign({}, FRAMES, { pump: [[3, 1], [3, 2], [3, 3]] }), 1]]
    .forEach(([tag, spec, dir]) => {
      const presses = dir === null ? [] : [{ t: 1.5, kind: 'press' }, { t: 2.4, kind: 'release' }];
      const r = simulate(lv, spec, dir, presses);
      console.log('  H=' + H + ' ' + tag.padEnd(9) + r.result.padEnd(5) +
        ' t=' + r.time.toFixed(1).padStart(5) + ' x=' + (r.x === null ? '—' : r.x.toFixed(1)));
    });
});

/* 1-6「抬个头」剖面：**短沟 + 高台**，而不是"长沟"。
 *
 * 为什么放弃长沟：
 *   气球是建造期就挂上、全程都在起作用的。lift 一旦到车重的 80%，
 *   沿坡的加速度就只剩 20%（a = g·(m−lift)/m·(sinθ − μcosθ)），
 *   要 10 秒才滚到 5 m/s。而长沟（8 米）需要 3 秒以上的滞空，
 *   以 2.5 m/s 的封顶上升速度就是 7.5 米高 —— 早就飞过地图顶了。
 *   短沟（3 米）只需 1.2 秒滞空 = 3 米爬升，正好够上一个 2 米高的台子。
 *
 * 为什么高台而不是深沟：
 *   深沟只需要横向速度，"滚得快"就能过，气球完全不必需；
 *   2 米高的垂直台面则必须**升空**才能上去 —— 轮子半径只有 0.34 米，
 *   垂直立面谁也爬不上去（chassisGrip 0.75 对竖直面无效）。
 *
 * 剖面（ROWS=16，height = ROWS − topRow）：
 *   c0..c2    row8→10   出生就在坡上
 *   c3..c12   row12     助跑 10 米（约 4 秒滚到 2.5 m/s）
 *   c13..     ← 3 米沟 →
 *   c16..c29  row10     高台（比助跑面高 2 米）
 *   c30..     row11     缓下坡，滚到终点
 */
const R = require('../prototype/game.js');

const COLS = 48, ROWS = 16;

function build(o) {
  const p = {};
  p[0] = 8; p[1] = 9; p[2] = 10;
  for (let c = 3; c <= 12; c++) p[c] = 12;
  const gapStart = 13, gapW = o.gapW;
  const platStart = gapStart + gapW;
  const platTop = 12 - o.platUp;
  for (let c = platStart; c <= platStart + 13; c++) p[c] = platTop;
  for (let c = platStart + 14; c < COLS; c++) p[c] = platTop + 1;
  const rows = [];
  for (let r = 0; r < ROWS; r++) rows.push(new Array(COLS).fill('.'));
  for (let c = 0; c < COLS; c++) {
    const top = p[c];
    if (top === undefined) continue;
    for (let r = top; r < ROWS; r++) rows[r][c] = '#';
  }
  const hard = [];
  for (let k = gapStart - 1; k <= platStart; k++) hard.push(k);
  return {
    levelId: '1-6', name: '抬个头', chapter: 1, biome: 'dusk',
    grid: { cols: COLS, rows: ROWS, cell: 1.0, px: 32 },
    buildArea: { cols: 6, rows: 8 },
    start: { col: 1, row: 4 },
    goal: { col: platStart + 9, row: platTop - 1 },
    hardCols: hard,
    physics: { gravity: 16.0, stepHz: 60, subSteps: 4, friction: { mud: 0.6, stone: 0.45, ice: 0.05 } },
    partsBox: { wood_frame: 3, wood_wheel: 2, balloon: 6, sandbag: 3, pig: 1 },
    mapRows: rows.map(r => r.join('')),
    materials: [
      { surfaceRow: 12, cols: [0, gapStart - 1], type: 'mud' },
      { surfaceRow: platTop, cols: [platStart, COLS - 1], type: 'stone' }
    ],
    boxes: [{ col: platStart + 4, row: platTop - 1 }],
    _gapStart: gapStart, _gapW: gapW, _platStart: platStart, _platTop: platTop,
    _goalCol: platStart + 9
  };
}

function stackInto(lv, b, part, r, c, n) {
  const key = r + ',' + c;
  if (!R.tryPlace(lv, b, part, r, c).ok) return 0;
  let have = R.cellCount(b.cells[key]);
  while (have < Math.min(n, R.PARTS[part].maxStack || 3)) {
    const r2 = R.tryPlace(lv, b, part, r, c);
    if (!r2.ok) break;
    const got = R.cellCount(b.cells[key]);
    if (got <= have) break;
    have = got;
  }
  return have;
}

/* 3 框第 1/2/3 列 + 木轮 1/3 列 + 猪居中（必须 1/2/3 列：绕原点旋转会倒扣） */
function makeCar(lv, opt) {
  R.resetParams();
  const b = R.newBuild();
  for (const c of [1, 2, 3]) R.tryPlace(lv, b, 'wood_frame', 4, c);
  R.tryPlace(lv, b, 'wood_wheel', 5, 1);
  R.tryPlace(lv, b, 'wood_wheel', 5, 3);
  R.tryPlace(lv, b, 'pig', 4, 2);
  let want = opt.balloons || 0;
  for (const c of [1, 2, 3]) { if (want <= 0) break; want -= stackInto(lv, b, 'balloon', 3, c, Math.min(3, want)); }
  if (opt.sandbags) stackInto(lv, b, 'sandbag', 5, 2, opt.sandbags);
  return b;
}

function run(lv, b, schedule, maxt) {
  const st = R.createRun(lv, b);
  const sc = (schedule || []).slice().sort((a, c) => a.t - c.t);
  let maxX = -99, maxY = -99;
  for (let i = 0; i < 60 * (maxt || 22); i++) {
    if (st.phase !== 'run') break;
    while (sc.length && st.time >= sc[0].t) {
      const a = sc.shift();
      for (let k = 0; k < (a.n || 1); k++) { if (a.do === 'drop') R.dropSandbag(st); else R.popBalloon(st); }
    }
    R.step(st, 1 / 60);
    maxX = Math.max(maxX, st.car.x);
    maxY = Math.max(maxY, st.car.y);
  }
  return { st, maxX, maxY, res: st.result || st.failReason || 'running',
    pops: st.balloonPops, dropped: st.sandbagsDropped, net: st.car.netMass,
    x: st.car.x, y: st.car.y, t: st.time };
}

function scenario(o, kind, sched, maxt) {
  const lv = build(o);
  if (kind === 'A') lv.partsBox.sandbag = 0;
  if (kind === 'B') lv.partsBox.balloon = 0;
  const b = makeCar(lv, { balloons: kind === 'B' ? 0 : 6, sandbags: kind === 'A' ? 0 : 3 });
  return run(lv, b, sched, maxt);
}

module.exports = { build, makeCar, run, scenario, stackInto, R, COLS, ROWS };

if (require.main === module) {
  for (const o of [{ gapW: 3, platUp: 2 }, { gapW: 3, platUp: 3 }, { gapW: 4, platUp: 2 }, { gapW: 4, platUp: 3 }]) {
    console.log(`\n########## 沟${o.gapW} 台+${o.platUp} ##########`);
    const lv = build(o);
    const ter = R.makeTerrain(lv);
    lv.mapRows.forEach((s, i) => console.log(String(i).padStart(2) + ' ' + s.slice(0, 32)));
    console.log('地表 c8..c20: ' + Array.from({ length: 13 }, (_, i) => `c${8 + i}=${ter.surfaceY(8 + i + 0.5).toFixed(1)}`).join(' '));
    const A = scenario(o, 'A', null, 22);
    console.log(`  A 只气球 ${String(A.res).padEnd(11)} x=${A.x.toFixed(2)} maxX=${A.maxX.toFixed(1)}`);
    const B = scenario(o, 'B', null, 22);
    console.log(`  B 只沙袋 ${String(B.res).padEnd(11)} x=${B.x.toFixed(2)} maxX=${B.maxX.toFixed(1)}`);
    const C = scenario(o, 'C', null, 22);
    console.log(`  C 都不扔 ${String(C.res).padEnd(11)} x=${C.x.toFixed(2)} maxX=${C.maxX.toFixed(1)}`);
    const wins = [];
    let best = { maxX: -99, td: 0, tp: 0 };
    for (let td = 1.0; td <= 5.01; td += 0.2) {
      for (let tp = td + 0.4; tp <= td + 4.01; tp += 0.2) {
        const r = scenario(o, 'C', [{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: 3 }], 24);
        if (r.res === 'win') wins.push({ td: +td.toFixed(2), tp: +tp.toFixed(2) });
        if (r.maxX > best.maxX) best = { maxX: r.maxX, td: +td.toFixed(2), tp: +tp.toFixed(2), res: r.res };
      }
    }
    console.log(`  通关 ${wins.length} 组` + (wins.length ? '' : `；最远 x=${best.maxX.toFixed(1)} 扔@${best.td} 扎@${best.tp} (${best.res})`));
    if (wins.length) {
      const byTd = {};
      wins.forEach(w => { byTd[w.td] = (byTd[w.td] || []).concat(w.tp); });
      Object.keys(byTd).map(Number).sort((a, b) => a - b).forEach(td => {
        console.log(`    扔@${td.toFixed(1)} → 扎 @ ${byTd[td].map(t => t.toFixed(1)).join(',')}`);
      });
    }
  }
}

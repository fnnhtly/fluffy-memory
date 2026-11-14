/* 1-6 换成"悬浮上高塔"结构，解决一个真实的物理矛盾。
 *
 * 矛盾：气球是**定速上升**（liftMaxRise = 2.5 m/s），横向只有 ~2 m/s。
 * 也就是说车在空中的轨迹斜率是 1.25 : 1 —— 每前进 1 米就升高 1.25 米。
 * 前一版把终点放在离台沿 9 格的地方，为了"落在 9 米外"，
 * 车必须先爬到 15 米（比台面高 10 米）—— 车直接飘出画面，
 * 玩家根本看不见自己在操纵什么，而且弧越高，扎早扎晚的容错反而越窄。
 *
 * 换成高塔：塔顶就是终点，比助跑面高 5 米。
 *   车只需要"升到塔顶高度"就够了，弧顶只比塔顶高一点点；
 *   不扎气球 → 从塔顶上方飞过去 → 撞天花板（flew_away），
 *   因为终点判定加了高度门槛（|高度差| ≤ 3 m），飞过去不算到。
 * 这样"扎气球"才真的成为**必需**动作，而不是可选的减速键。
 */
const R = require('../prototype/game.js');

const COLS = 44, ROWS = 18;

function build(o) {
  o = Object.assign({ gapW: 3, towerUp: 5, towerW: 7, goalOff: 3, runup: 12 }, o);
  const gapStart = o.runup + 1;                 // 13
  const towerStart = gapStart + o.gapW;         // 16
  const towerTopRow = 12 - o.towerUp;           // 塔顶行
  const p = {};
  p[0] = 9; p[1] = 10; p[2] = 11;
  for (let c = 3; c <= o.runup; c++) p[c] = 12;
  // 沟：gapStart .. towerStart-1 不给地面
  for (let c = towerStart; c < towerStart + o.towerW; c++) p[c] = towerTopRow;
  // 塔后留一个坑，飞过去就掉下去
  for (let c = towerStart + o.towerW; c < COLS; c++) p[c] = 16;

  const rows = [];
  for (let r = 0; r < ROWS; r++) rows.push(new Array(COLS).fill('.'));
  for (let c = 0; c < COLS; c++) {
    const top = p[c];
    if (top === undefined) continue;
    for (let r = top; r < ROWS; r++) rows[r][c] = '#';
  }
  const hard = [];
  for (let k = gapStart - 1; k <= towerStart + o.towerW; k++) hard.push(k);
  const goalCol = towerStart + o.goalOff;

  return {
    levelId: '1-6', name: '抬个头', chapter: 1, biome: 'dusk',
    grid: { cols: COLS, rows: ROWS, cell: 1.0, px: 32 },
    buildArea: { cols: 6, rows: 8 },
    start: { col: 1, row: 4 },
    goal: { col: goalCol, row: towerTopRow - 1 },
    hardCols: hard,
    physics: { gravity: 16.0, stepHz: 60, subSteps: 4, friction: { mud: 0.6, stone: 0.45, ice: 0.05 } },
    partsBox: { wood_frame: 3, wood_wheel: 2, balloon: 6, sandbag: 3, pig: 1 },
    mapRows: rows.map(r => r.join('')),
    materials: [
      { surfaceRow: 12, cols: [0, gapStart - 1], type: 'mud' },
      { surfaceRow: towerTopRow, cols: [towerStart, towerStart + o.towerW - 1], type: 'stone' }
    ],
    boxes: [{ col: goalCol + 2, row: towerTopRow - 1 }],
    _o: o, _gapStart: gapStart, _towerStart: towerStart, _towerTopRow: towerTopRow, _goalCol: goalCol
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
  for (let i = 0; i < 60 * (maxt || 26); i++) {
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

module.exports = { build, makeCar, run, stackInto, R, COLS, ROWS };

if (require.main === module) {
  const configs = [
    { gapW: 3, towerUp: 5, towerW: 7, goalOff: 3 },
    { gapW: 3, towerUp: 4, towerW: 7, goalOff: 3 },
    { gapW: 4, towerUp: 5, towerW: 8, goalOff: 4 },
    { gapW: 2, towerUp: 5, towerW: 6, goalOff: 3 }
  ];
  for (const cfg of configs) {
    const lv = build(cfg);
    const ter = R.makeTerrain(lv);
    const towerY = ter.surfaceY(lv._towerStart + 0.5);
    const runY = ter.surfaceY(lv._o.runup - 1.5);
    console.log(`\n##### 沟${cfg.gapW} 塔+${cfg.towerUp} 宽${cfg.towerW} 终点+${cfg.goalOff} #####`);
    lv.mapRows.forEach((s, i) => console.log(String(i).padStart(2) + ' ' + s.slice(0, 36)));
    console.log(`助跑面 y=${runY.toFixed(2)} 塔顶 y=${towerY.toFixed(2)} 差 ${(towerY - runY).toFixed(2)}m 终点 c${lv._goalCol} 天花板 y>${ter.rows + 6}`);

    const mk = (ov) => { const l2 = build(Object.assign({}, cfg, ov)); return l2; };
    const A = run(mk({ partsBoxAbsent: 'sandbag' }), makeCar(mk({ partsBoxAbsent: 'sandbag' }), { balloons: 6, sandbags: 0 }), null);
    console.log(`  A 只气球 ${String(A.res).padEnd(11)} maxX=${A.maxX.toFixed(1)} maxY=${A.maxY.toFixed(1)}`);
    const B = run(mk(), makeCar(mk(), { balloons: 0, sandbags: 3 }), null);
    console.log(`  B 只沙袋 ${String(B.res).padEnd(11)} maxX=${B.maxX.toFixed(1)} maxY=${B.maxY.toFixed(1)}`);
    const C = run(mk(), makeCar(mk(), { balloons: 6, sandbags: 3 }), null);
    console.log(`  C 都不扔 ${String(C.res).padEnd(11)} maxX=${C.maxX.toFixed(1)} maxY=${C.maxY.toFixed(1)}`);

    const wins = [];
    let best = { maxY: 99 };
    for (let td = 2.0; td <= 6.01; td += 0.2) {
      for (let tp = td + 0.3; tp <= td + 7.01; tp += 0.2) {
        const r = run(mk(), makeCar(mk(), { balloons: 6, sandbags: 3 }),
          [{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: 1 }], 28);
        if (r.res === 'win') { wins.push({ td: +td.toFixed(1), tp: +tp.toFixed(1), maxY: r.maxY, t: r.t }); if (r.maxY < best.maxY) best = { ...r, td, tp }; }
      }
    }
    console.log(`  通关 ${wins.length} 组 ${wins.length ? `弧顶最低 y=${best.maxY.toFixed(2)}（塔顶+${(best.maxY - towerY).toFixed(2)}m）扔@${best.td.toFixed(1)} 扎@${best.tp.toFixed(1)}` : ''}`);
  }
}

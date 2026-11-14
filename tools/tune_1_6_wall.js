/* 1-6「抬个头」—— 真正的病灶：**飞行轨迹的斜率是固定的**。
 *
 * 气球的上升是定速的（liftMaxRise = 2.5 m/s），而车到崖口时横速只有 ~2.2 m/s
 * （因为 lift 吃掉了 80% 的重力，沿坡加速度只剩 0.6 m/s²）。
 * 于是空中的轨迹斜率 ≈ 2.5 : 2.2 ≈ 1.14 : 1 —— **前进 1 米就得升高 1.14 米**。
 *
 * 这一条决定了所有"跨沟"关都不可能好玩：
 *   要跨 6 米沟 → 必须升 6.8 米 → 弧顶比台面高 10 米 → 车飘出画面
 *   想压低弧顶 → 窗口塌到 0.1 秒 → 变成碰运气
 * 两难是几何决定的，调参数解决不了。
 *
 * 所以关卡的难点从"横向跨多远"改成"纵向要够高"：
 *   把沟缩短到 0–2 格，把对岸抬高 3–5 格。
 *   车要做的就只是"升起来、飘过去、落到高台上"，
 *   横向只需 2–3 米 = 1.2 秒滞空 = 3 米爬升，弧顶低、窗口宽。
 *   而高台的立面又让"不升空"变成绝对不可能（轮子半径 0.34 米，爬不上垂直面）。
 */
const R = require('../prototype/game.js');

const COLS = 44, ROWS = 18;

function build(o) {
  o = Object.assign({ gapW: 1, wallUp: 4, runup: 11, platW: 10, goalOff: 4 }, o);
  const gapStart = o.runup + 1;
  const platStart = gapStart + o.gapW;
  const baseRow = 12;
  const platTopRow = baseRow - o.wallUp;
  const p = {};
  p[0] = 9; p[1] = 10; p[2] = 11;
  for (let c = 3; c <= o.runup; c++) p[c] = baseRow;
  for (let c = platStart; c < platStart + o.platW; c++) p[c] = platTopRow;
  for (let c = platStart + o.platW; c < COLS; c++) p[c] = ROWS - 2;

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
    goal: { col: platStart + o.goalOff, row: platTopRow - 1 },
    hardCols: hard,
    physics: { gravity: 16.0, stepHz: 60, subSteps: 4, friction: { mud: 0.6, stone: 0.45, ice: 0.05 } },
    partsBox: { wood_frame: 3, wood_wheel: 2, balloon: 6, sandbag: 3, pig: 1 },
    mapRows: rows.map(r => r.join('')),
    materials: [
      { surfaceRow: baseRow, cols: [0, gapStart - 1], type: 'mud' },
      { surfaceRow: platTopRow, cols: [platStart, platStart + o.platW - 1], type: 'stone' }
    ],
    boxes: [{ col: platStart + o.goalOff + 2, row: platTopRow - 1 }],
    _o: o, _gapStart: gapStart, _platStart: platStart, _platTopRow: platTopRow,
    _platY: platTopRow, _goalCol: platStart + o.goalOff
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
  const cfgs = [
    { gapW: 0, wallUp: 3 }, { gapW: 0, wallUp: 4 }, { gapW: 0, wallUp: 5 },
    { gapW: 1, wallUp: 3 }, { gapW: 1, wallUp: 4 }, { gapW: 1, wallUp: 5 },
    { gapW: 2, wallUp: 4 }, { gapW: 2, wallUp: 5 }
  ];
  for (const cfg of cfgs) {
    const lv = build(cfg);
    const ter = R.makeTerrain(lv);
    const platY = ter.surfaceY(lv._platStart + 0.5);
    const runY = ter.surfaceY(lv._o.runup - 1.5);
    const A = (() => { const l = build(cfg); return run(l, makeCar(l, { balloons: 6 }), null, 30); })();
    const B = (() => { const l = build(cfg); return run(l, makeCar(l, { balloons: 0, sandbags: 3 }), null, 30); })();
    const C = (() => { const l = build(cfg); return run(l, makeCar(l, { balloons: 6, sandbags: 3 }), null, 30); })();

    const wins = [];
    let low = { maxY: 1e9 };
    for (let td = 1.0; td <= 6.01; td += 0.2) {
      for (let tp = td + 0.3; tp <= td + 7.01; tp += 0.2) {
        const l = build(cfg);
        const r = run(l, makeCar(l, { balloons: 6, sandbags: 3 }),
          [{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: 1 }], 30);
        if (r.res === 'win') { wins.push({ td: +td.toFixed(1), tp: +tp.toFixed(1), maxY: r.maxY }); if (r.maxY < low.maxY) low = { ...r, td, tp }; }
      }
    }
    console.log(`沟${cfg.gapW} 台+${cfg.wallUp}: 助跑y=${runY.toFixed(2)} 台y=${platY.toFixed(2)} 高差${(platY - runY).toFixed(2)}m` +
      ` | A=${A.res} B=${B.res} C=${C.res} | 通关${wins.length}` +
      (wins.length ? ` 最低弧顶 台+${(low.maxY - platY).toFixed(2)}m (扔@${low.td.toFixed(1)} 扎@${low.tp.toFixed(1)})` : ''));
  }
}

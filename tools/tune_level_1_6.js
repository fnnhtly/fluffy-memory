/* 1-6 参数扫描：找出"没有气球/沙袋一定过不去，有且会用才过得去"的地形。
 *
 * 为什么必须扫，不能画：
 *   车的接触面只有 `terrain.surfaceY(x)`（3 轮高斯平滑后的连续高度场），
 *   而获胜判定只有 `car.x >= goal.col` 一条 —— 与高度完全无关。
 *   于是"8 米沟"在平滑后可能只剩 3 米落差，一个够快的下坡就能靠惯性飞过去，
 *   气球和沙袋就都变成装饰了。这件事只能靠数字证明。
 *
 * 三个已经踩过的坑，扫描网格必须绕开：
 *   1. **车是绕原点旋转的**。重力作用在原点、不产生力矩，
 *      所以 3 格宽的车摆在 0/1/2 列时两块轮子的支撑力矩同向、无人抵消，
 *      车会慢慢倒扣（实测 5 秒转到 −2.26 rad 卡死）。必须摆 1/2/3 列。
 *   2. **起步坡度要 > 0.14**。滚动阻力 rollMu=0.14，缓于这个的车永远起不来，
 *      会静静坐满 5 秒然后判 stuck —— 看起来像"关卡设计错了"，其实是物理。
 *   3. **没有天花板的关卡不会结算**。只挂气球不装轮子的车会以 2.5 m/s 匀速
 *      上升，飞出地图上方也一直 running；`flew_away` 就是为此加的。
 */

const R = require('../prototype/game.js');

const COLS = 48, ROWS = 16, GROUND = 12;   // 地面基准行

function buildMap(profile) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) rows.push(new Array(COLS).fill('.'));
  for (let c = 0; c < COLS; c++) {
    const top = profile[c];
    if (top === undefined) continue;
    for (let r = top; r < ROWS; r++) rows[r][c] = '#';
  }
  return rows.map(r => r.join(''));
}

/* 剖面：从第 0 列就开始下坡（这样车一出生就在斜面上，能滚起来），
 * 坡长 rampLen 列，每 rowsPerCol 列降 1 格；然后平一段 flatLen 冲到崖口；
 * 沟宽 gapW 列（整列空）；对岸高度 GROUND + farDrop。 */
function makeProfile(o) {
  const p = {};
  let c = 0;
  for (let i = 0; i < o.rampLen; i++, c++) {
    p[c] = GROUND - Math.round((i + 1) / o.rowsPerCol);
  }
  for (let i = 0; i < o.flatLen; i++, c++) p[c] = GROUND - Math.round(o.rampLen / o.rowsPerCol);
  const edge = c;
  for (let i = 0; i < o.gapW; i++, c++) p[c] = undefined;
  const farTop = GROUND - Math.round(o.rampLen / o.rowsPerCol) + (o.farDrop || 0);
  for (; c < COLS; c++) p[c] = farTop;
  return { profile: p, edge, farTop };
}

function makeLevel(o) {
  const { profile, edge, farTop } = makeProfile(o);
  const mapRows = buildMap(profile);
  const goalCol = edge + o.gapW + (o.landLen === undefined ? 4 : o.landLen);
  const topRow = GROUND - Math.round(o.rampLen / o.rowsPerCol);
  const hard = [];
  /* 沟两侧不平滑：沟必须是真深。只硬到崖口前一列，坡本身还是要平滑的 */
  for (let k = edge - 1; k <= edge + o.gapW; k++) hard.push(k);
  return {
    levelId: '1-6', name: '抬个头', chapter: 1, biome: 'dusk',
    grid: { cols: COLS, rows: ROWS, cell: 1.0, px: 32 },
    buildArea: { cols: 6, rows: 8 },
    start: { col: 1, row: 4 },
    goal: { col: goalCol, row: farTop + 2 },
    hardCols: hard,
    physics: { gravity: 16.0, stepHz: 60, subSteps: 4, friction: { mud: 0.6, stone: 0.45, ice: 0.05 } },
    partsBox: { wood_frame: 3, wood_wheel: 2, balloon: 6, sandbag: 3, pig: 1 },
    mapRows: mapRows,
    materials: [
      { surfaceRow: topRow, cols: [0, edge], type: 'mud' },
      { surfaceRow: farTop, cols: [edge + o.gapW + 1, COLS - 1], type: 'stone' }
    ],
    boxes: [{ col: goalCol - 3, row: farTop - 1 }],
    _edge: edge, _goalCol: goalCol, _topRow: topRow, _farTop: farTop
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

/* 3 框（第 1/2/3 列）+ 两端木轮（第 1/3 列）+ 猪居中 = 6.3 kg。
 * 必须摆 1/2/3 列：绕原点旋转 + 重力不过原点 ⇒ 0/1/2 列会倒扣（见文件头）。 */
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

function run(lv, b, dropAt, maxt) {
  const st = R.createRun(lv, b);
  const drops = (dropAt || []).slice();
  let maxX = -99, maxY = -99;
  for (let i = 0; i < 60 * (maxt || 18); i++) {
    if (st.phase !== 'run') break;
    while (drops.length && st.time >= drops[0]) { drops.shift(); R.dropSandbag(st); }
    R.step(st, 1 / 60);
    maxX = Math.max(maxX, st.car.x);
    maxY = Math.max(maxY, st.car.y);
  }
  return { st, maxX, maxY, res: st.result || st.failReason || 'running',
    pops: st.balloonPops, dropped: st.sandbagsDropped, net: st.car.netMass };
}

function scenario(o, kind, dropAt) {
  const lv = makeLevel(o);
  if (kind === 'A') lv.partsBox.sandbag = 0;
  if (kind === 'B') lv.partsBox.balloon = 0;
  const b = makeCar(lv, { balloons: kind === 'B' ? 0 : 6, sandbags: kind === 'A' ? 0 : 3 });
  return run(lv, b, dropAt, 18);
}

function evaluate(o) {
  const A = scenario(o, 'A');
  const B = scenario(o, 'B');
  const C = scenario(o, 'C');
  const win = [];
  let best = { maxX: -99 };
  for (let t = 0.3; t <= 8.01; t += 0.15) {
    const r = scenario(o, 'C', [t, t + 0.04, t + 0.08]);
    if (r.res === 'win') win.push(+t.toFixed(2));
    if (r.maxX > best.maxX) best = { maxX: r.maxX, t: +t.toFixed(2), res: r.res };
  }
  return { A, B, C, win, best, goalCol: makeLevel(o)._goalCol };
}

module.exports = { makeLevel, makeProfile, makeCar, run, evaluate, scenario, stackInto, R, COLS, ROWS, GROUND };

if (require.main === module) {
  const grid = [];
  for (const rowsPerCol of [1.5, 2, 2.5, 3]) {
    for (const rampLen of [8, 12, 16]) {
      for (const flatLen of [1, 3]) {
        for (const gapW of [6, 8, 10]) {
          grid.push({ rowsPerCol, rampLen, flatLen, gapW, farDrop: 0, landLen: 4 });
        }
      }
    }
  }
  const results = [];
  for (const o of grid) {
    const tag = `${o.rowsPerCol}格/坡${o.rampLen}/平${o.flatLen}/沟${o.gapW}`;
    const ev = evaluate(o);
    const ok = ev.A.res !== 'win' && ev.B.res !== 'win' && ev.C.res !== 'win' && ev.win.length > 0;
    results.push({ tag, o, ev, ok });
    console.log(`${ok ? '✅' : '  '} ${tag.padEnd(22)} A=${String(ev.A.res).padEnd(9)} B=${String(ev.B.res).padEnd(9)} ` +
      `C=${String(ev.C.res).padEnd(9)} 窗口=${String(ev.win.length).padStart(3)}  最远=${(ev.best.maxX || 0).toFixed(1)}/${ev.goalCol}`);
  }
  const good = results.filter(r => r.ok);
  console.log(`\n合格 ${good.length}/${results.length}`);
  good.sort((a, b) => a.ev.win.length - b.ev.win.length);
  good.slice(0, 15).forEach(r => console.log(`  ✅ ${r.tag}  窗口 ${r.ev.win.length}: ${r.ev.win.join(',')}`));
}

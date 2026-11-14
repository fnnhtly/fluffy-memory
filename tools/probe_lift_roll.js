/* 一个必须先钉死的事实：**挂着气球的车还能不能正常滚下坡？**
 *
 * 1-6 的设计全靠这一条：带沙袋压住 → 滚下坡攒速度 → 崖口扔沙袋起飞。
 * 但气球的浮力是直接加在 `fy` 上的（`fy += G·liftMass`），
 * 而轮子的法向力是由**穿透深度**算出来的（N = 320·pen − 50·vn），
 * 两者互不知情。浮力一到 80% 车重，轮子只需要撑住剩下的 20%，
 * 穿透深度随之变小，摩擦上限 μN 也跟着变小 —— 按理说应该**更容易**滑下去，
 * 可实测车在 45° 坡上 4 秒只挪了 1.2 米。
 *
 * 所以这里把三件事分开量：
 *   1. 缓坡（tan≈0.36）上，无气球 / 有气球 / 有气球+沙袋，各自的加速度
 *   2. 坡上停住时轮子到底有没有接触（pen > 0 的帧占比）
 *   3. 车壳四角是不是在"挖地"（角点接触会提供几乎闸死级别的静摩擦）
 */
const R = require('../prototype/game.js');

const COLS = 40, ROWS = 16;

function makeSlope(dropPerCol, len) {
  const mapRows = [];
  for (let r = 0; r < ROWS; r++) mapRows.push(new Array(COLS).fill('.'));
  const rowsArr = mapRows;
  for (let c = 0; c < COLS; c++) {
    const steps = c < len ? Math.round(c * dropPerCol) : Math.round(len * dropPerCol);
    const top = 6 + steps;
    for (let r = top; r < ROWS; r++) rowsArr[r][c] = '#';
  }
  return {
    levelId: 'P', name: 'slope', chapter: 1, biome: 'field',
    grid: { cols: COLS, rows: ROWS, cell: 1.0, px: 32 },
    buildArea: { cols: 6, rows: 8 },
    start: { col: 1, row: 4 },
    goal: { col: 39, row: 14 },
    physics: { gravity: 16.0, stepHz: 60, subSteps: 4, friction: { mud: 0.6, stone: 0.45, ice: 0.05 } },
    partsBox: { wood_frame: 3, wood_wheel: 2, balloon: 9, sandbag: 6, pig: 1 },
    mapRows: rowsArr.map(r => r.join('')),
    materials: [{ surfaceRow: 6, cols: [0, COLS - 1], type: 'mud' }],
    boxes: []
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

function makeCar(lv, balloons, bags) {
  R.resetParams();
  const b = R.newBuild();
  for (const c of [1, 2, 3]) R.tryPlace(lv, b, 'wood_frame', 4, c);
  R.tryPlace(lv, b, 'wood_wheel', 5, 1);
  R.tryPlace(lv, b, 'wood_wheel', 5, 3);
  R.tryPlace(lv, b, 'pig', 4, 2);
  let want = balloons;
  for (const c of [1, 2, 3]) { if (want <= 0) break; want -= stackInto(lv, b, 'balloon', 3, c, Math.min(3, want)); }
  if (bags) stackInto(lv, b, 'sandbag', 5, 2, bags);
  return b;
}

function measure(dropPerCol, len, balloons, bags, secs) {
  const lv = makeSlope(dropPerCol, len);
  const b = makeCar(lv, balloons, bags);
  const car = R.buildVehicle(lv, b);
  R.Params.collectContacts = null;
  const st = R.createRun(lv, b);
  const y0 = st.car.y, x0 = st.car.x;
  const vxs = [];
  for (let i = 0; i < 60 * secs; i++) {
    if (st.phase !== 'run') break;
    R.step(st, 1 / 60);
    if (i % 30 === 0) vxs.push(st.car.vx);
  }
  return {
    mass: car.mass, lift: car.liftMass, net: car.netMass,
    dx: st.car.x - x0, dy: st.car.y - y0,
    vx: st.car.vx, t: st.time, res: st.result || st.failReason || 'running',
    vxs: vxs.map(v => +v.toFixed(2))
  };
}

function show(tag, m) {
  console.log(`  ${tag.padEnd(22)} mass=${m.mass.toFixed(2)} net=${m.net.toFixed(2).padStart(5)}` +
    `  Δx=${m.dx.toFixed(2).padStart(6)}  Δy=${m.dy.toFixed(2).padStart(6)}  vx=${m.vx.toFixed(2).padStart(5)}  ${m.res}`);
}

console.log('=== 1. 缓坡 tan≈0.36（20°），10 秒 ===');
for (const [tag, bl, bg] of [['无气球无沙袋', 0, 0], ['3 气球', 3, 0], ['6 气球', 6, 0], ['6 气球+3 沙袋', 6, 3], ['6 气球+6 沙袋', 6, 6]]) {
  show(tag, measure(0.36, 30, bl, bg, 10));
}
console.log('  速度曲线（每秒）:');
for (const [tag, bl, bg] of [['无气球', 0, 0], ['6 气球', 6, 0], ['6 气球+3 沙袋', 6, 3]]) {
  const m = measure(0.36, 30, bl, bg, 10);
  console.log(`    ${tag.padEnd(14)} ${m.vxs.join(' → ')}`);
}

console.log('\n=== 2. 45° 坡（tan=1），6 秒 ===');
for (const [tag, bl, bg] of [['无气球无沙袋', 0, 0], ['6 气球', 6, 0], ['6 气球+3 沙袋', 6, 3]]) {
  show(tag, measure(1.0, 12, bl, bg, 6));
}

console.log('\n=== 3. 平面（tan=0）起步，6 秒 ===');
for (const [tag, bl, bg] of [['无气球无沙袋', 0, 0], ['6 气球', 6, 0], ['6 气球+3 沙袋', 6, 3], ['6 气球+6 沙袋', 6, 6]]) {
  show(tag, measure(0.0, 30, bl, bg, 6));
}

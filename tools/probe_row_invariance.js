/* 1-1 的物理是不是真的与"零件在网格里的绝对行号"无关？
 * 同一个相对形状，整体上移一行 / 下移一行，结果应当完全一致。
 * 如果不一致，说明某处用了绝对 ly，而不是相对量。 */
const R = require('../prototype/game.js');
const levels = require('../prototype/levels.js');
const lv = levels[0];

function buildWithShift(dr) {
  const build = R.newBuild();
  const spec = R.SPECS['1-1'];
  for (const part of Object.keys(spec)) {
    if (part.startsWith('_')) continue;
    spec[part].forEach(([r, c]) => {
      const key = (r + dr) + ',' + c;
      const isInner = R.PARTS[part] && R.PARTS[part].inner;
      if (!build.cells[key]) { build.cells[key] = { part, dir: 0 }; build.order.push(key); }
      if (isInner) build.cells[key].inner = part;
    });
  }
  return build;
}

function runSpec(dr) {
  const build = buildWithShift(dr);
  const run = R.createRun(lv, build);
  const startY = run.car.y, surf = run.terrain.surfaceY(run.car.x);
  for (let i = 0; i < 600; i++) {
    R.step(run, 1 / 60);
    if (run.phase !== 'run') break;
  }
  return {
    dr,
    ly4: build.cells[(4 + dr) + ',2'] ? R.buildVehicle(lv, build).parts.find(p => p.r === 4 + dr && p.c === 2).ly : null,
    spawnAlt: +(startY - surf).toFixed(3),
    phase: run.phase,
    reason: run.failReason,
    t: +run.time.toFixed(2),
    x: +run.car.x.toFixed(2),
    a: +(run.car.a * 180 / Math.PI).toFixed(0),
    result: run.result, stars: run.stars,
    broken: run.hullBroken, ejected: run.pigEjected
  };
}

console.log('BUILD_ROWS =', R.BUILD_ROWS);
for (const dr of [-1, 0, 1, 2]) {
  try { console.log(JSON.stringify(runSpec(dr))); }
  catch (e) { console.log(JSON.stringify({ dr, error: String(e.message) })); }
}

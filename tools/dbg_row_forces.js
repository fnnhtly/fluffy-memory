/* 同一形状整体下移一行，物理为什么真的变了？
 *
 * 上面两步已经证明：这不是浮点噪声（δ=1e-9 稳定），也不是"竖直位置无关"
 * （下移 1 米就从 3 星变翻车）。那说明引擎里**确实有以绝对高度为准的东西**。
 * 这个探针把每帧的力/接触量打印出来，找那个不随平移不变的量。
 */
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

for (const dr of [0, 1]) {
  const build = buildWithShift(dr);
  const car0 = R.buildVehicle(lv, build);
  const run = R.createRun(lv, build);
  const car = run.car;
  const surf = run.terrain.surfaceY(car.x);
  console.log('--- dr=' + dr + ' ---');
  console.log('  car.y', car.y.toFixed(4), 'surf', surf.toFixed(4),
    'alt', (car.y - surf).toFixed(4));
  console.log('  hull', JSON.stringify(car.hull));
  console.log('  hullBottom(world)', (car.y + car.hull.minY).toFixed(4),
    'gap', (car.y + car.hull.minY - surf).toFixed(4));
  car.wheels.forEach((w, i) => {
    const wp = { x: car.x + w.lx, y: car.y + w.ly };
    const gy = run.terrain.surfaceY(wp.x);
    console.log('  wheel' + i, 'wp.y', wp.y.toFixed(4), 'gy', gy.toFixed(4),
      'pen', (gy - (wp.y - w.def.radius)).toFixed(4),
      'r', w.def.radius);
  });
  // corners
  const hb = car.hull, ins = 0.08;
  [[hb.minX + ins, hb.minY + ins], [hb.maxX - ins, hb.minY + ins],
   [hb.minX + ins, hb.maxY - ins], [hb.maxX - ins, hb.maxY - ins]].forEach(([lx, ly], i) => {
    const cx = car.x + lx, cy = car.y + ly;
    const gy = run.terrain.surfaceY(cx);
    console.log('  corner' + i, 'y', cy.toFixed(4), 'gy', gy.toFixed(4),
      'pen', (gy - cy).toFixed(4));
  });
  console.log('  mass', car.mass.toFixed(3), 'inertia inv', car.invI.toFixed(4),
    'G', R.Params.gravity);
}

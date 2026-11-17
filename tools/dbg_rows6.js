/* 8 行改 6 行之后，1-1 标准解为什么散架了？ */
const R = require('../prototype/game.js');
const levels = require('../prototype/levels.js');

const lv = levels[0];
const build = R.newBuild();
const spec = R.SPECS['1-1'];
for (const part of Object.keys(spec)) {
  if (part.startsWith('_')) continue;
  spec[part].forEach(([r, c]) => {
    const key = r + ',' + c;
    const inner = R.PARTS[part] && R.PARTS[part].inner;
    if (!build.cells[key]) { build.cells[key] = { part, dir: 0 }; build.order.push(key); }
    if (inner) build.cells[key].inner = part;
  });
}
const car = R.buildVehicle(lv, build);
console.log('parts:');
car.parts.forEach(p => console.log('   ', p.part.padEnd(12), 'lx=' + p.lx.toFixed(2), 'ly=' + p.ly.toFixed(2)));
console.log('wheels:');
car.wheels.forEach(w => console.log('   ', w.part, 'ly=' + w.ly.toFixed(2), 'r=' + w.def.radius));
console.log('hull: minY', car.hull.minY, 'maxY', car.hull.maxY, 'minX', car.hull.minX, 'maxX', car.hull.maxX);

const run = R.createRun(lv, build);
console.log('spawn: x', run.car.x.toFixed(2), 'y', run.car.y.toFixed(2),
  'surface', run.terrain.surfaceY(run.car.x).toFixed(2),
  'alt', (run.car.y - run.terrain.surfaceY(run.car.x)).toFixed(2));
for (let i = 0; i < 400; i++) {
  R.step(run, 1 / 60);
  if (i % 60 === 0 || run.phase !== 'run') {
    console.log('t=' + run.time.toFixed(2), 'x=' + run.car.x.toFixed(2), 'y=' + run.car.y.toFixed(2),
      'a=' + (run.car.a * 180 / Math.PI).toFixed(0), 'phase=' + run.phase,
      run.failReason || '', 'broken=' + run.hullBroken, 'ejected=' + run.pigEjected);
  }
  if (run.phase !== 'run') break;
}

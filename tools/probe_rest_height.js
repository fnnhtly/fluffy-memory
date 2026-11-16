/* 量一下：一辆标准车出发时，车心离地面到底多高？
 * 这个数直接决定 BUILD_REST_Y（拼装区里车心离地的常量高度）。 */
const path = require('path');
const RAP = require('../prototype/game.js');
const levels = require('../prototype/levels.js');

const cases = [
  ['1-1', { 4: { 2: 'wood_frame', 3: 'wood_frame' }, 5: { 1: 'wood_wheel', 2: 'wood_frame', 3: 'wood_frame', 4: 'wood_wheel' } }],
  ['1-1 iron', { 4: { 2: 'iron_frame', 3: 'iron_frame' }, 5: { 1: 'iron_wheel', 2: 'iron_frame', 3: 'iron_frame', 4: 'iron_wheel' } }]
];

for (const [label, grid] of cases) {
  const lv = levels[0];
  const build = RAP.newBuild();
  for (const r of Object.keys(grid)) {
    for (const c of Object.keys(grid[r])) {
      const key = r + ',' + c;
      build.cells[key] = { part: grid[r][c], dir: 0 };
      build.order.push(key);
    }
  }
  const car = RAP.buildVehicle(lv, build);
  if (!car) { console.log(label, 'no car'); continue; }
  let lowest = car.hull.minY;
  if (car.wheels.length) {
    lowest = 0;
    car.wheels.forEach(w => { lowest = Math.min(lowest, w.ly - w.def.radius); });
  }
  const ter = RAP.makeTerrain(lv);
  const startX = lv.start.col + 0.5;
  const surf = ter.surfaceY(startX);
  const startY = surf - lowest + 0.01;
  console.log(label,
    '| hull.minY=' + car.hull.minY.toFixed(3),
    '| lowest=' + lowest.toFixed(3),
    '| surfaceY=' + surf.toFixed(3),
    '| startY=' + startY.toFixed(3),
    '| 车心离地=' + (startY - surf).toFixed(3) + ' m',
    '| wheels=' + car.wheels.length);
}

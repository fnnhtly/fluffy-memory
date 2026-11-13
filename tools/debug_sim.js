/* 诊断：打印车速/姿态与接触点数量，定位"下坡后立刻停住"的问题 */
const path = require('path');
const RAP = require(path.join(__dirname, '..', 'prototype', 'game.js'));
const LEVELS = require(path.join(__dirname, '..', 'prototype', 'levels.js'));

const which = process.argv[2] || '1-1';
const specKey = process.argv[3] || which;
const lv = LEVELS.find(l => l.levelId === which);
RAP.resetParams();
const build = RAP.newBuild();
RAP.applySpec(lv, build, RAP.SPECS[specKey]);
const st = RAP.createRun(lv, build);
const car = st.car;
console.log('level', which, 'spec', specKey, 'mass', car.mass.toFixed(2),
  'wheels', car.wheels.length, 'hull', JSON.stringify(car.hull),
  'spawn', car.x.toFixed(2), car.y.toFixed(2));

for (let i = 0; i < 480; i++) {
  RAP.step(st, 1 / 60);
  if (i % 15 === 0) {
    const ter = st.terrain;
    const w0 = car.wheels[0];
    let wheelPen = '-';
    if (w0) {
      const ca = Math.cos(car.a), sa = Math.sin(car.a);
      const wx = car.x + w0.lx * ca - w0.ly * sa;
      const wy = car.y + w0.lx * sa + w0.ly * ca;
      wheelPen = (ter.surfaceY(wx) - (wy - w0.def.radius)).toFixed(3);
    }
    console.log(i, 't=' + st.time.toFixed(2), 'x=' + car.x.toFixed(2), 'y=' + car.y.toFixed(2),
      'vx=' + car.vx.toFixed(2), 'vy=' + car.vy.toFixed(2), 'a=' + car.a.toFixed(2),
      'wheelPen=' + wheelPen, 'phase=' + st.phase + (st.failReason ? ':' + st.failReason : ''));
  }
  if (st.phase !== 'run') break;
}

/* 对比 simulate() 与手工 step() 的差异 */
const path = require('path');
const RAP = require(path.join(__dirname, '..', 'prototype', 'game.js'));
const LEVELS = require(path.join(__dirname, '..', 'prototype', 'levels.js'));
const lv = LEVELS.find(l => l.levelId === '1-2');

// A：simulate
const a = RAP.simulate(lv, RAP.SPECS['1-2'], {});
console.log('simulate: x=' + a.car.x.toFixed(2), 't=' + a.time.toFixed(1), 'result=' + a.result, a.failReason);

// B：手工
RAP.resetParams();
const build = RAP.newBuild();
RAP.applySpec(lv, build, RAP.SPECS['1-2']);
console.log('placed cells:', Object.keys(build.cells).length,
  JSON.stringify(Object.keys(build.cells).map(k => k + ':' + build.cells[k].part)));
const st = RAP.createRun(lv, build);
for (let i = 0; i < 60 * 25 && st.phase === 'run'; i++) RAP.step(st, 1 / 60);
console.log('manual  : x=' + st.car.x.toFixed(2), 't=' + st.time.toFixed(1), 'result=' + st.result, st.failReason);

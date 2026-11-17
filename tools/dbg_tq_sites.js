/* 引擎对"零件在网格里的绝对行号"并不不变 —— 这是个真 bug，必须定位。
 * 上面已经证明：整体下移一行后，车心 car.y 也 +1，所有**世界坐标**完全相同，
 * 但第 0 个子步的力矩就差了 2.48。所以某一处用的是局部 ly 或绝对行号。
 * 这个探针给每个 tq 贡献点单独打标签。 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const SRC = path.join(__dirname, '..', 'prototype', 'game.js');
const dst = path.join(os.tmpdir(), 'game_tq_' + Date.now() + '.js');
let s = fs.readFileSync(SRC, 'utf8');

// 给每个 tq += 打标签
s = s.split('        tq += tqRaw * 0.25;').join(
  '        tq += tqRaw * 0.25; if (global.__TQ) global.__TQ.tool = (global.__TQ.tool||0) + tqRaw*0.25;');
s = s.split('        tq += (op.lx * (of * owy)) - (op.ly * (of * owx));').join(
  '        tq += (op.lx * (of * owy)) - (op.ly * (of * owx));' +
  ' if (global.__TQ) global.__TQ.shot = (global.__TQ.shot||0) + (op.lx*(of*owy)) - (op.ly*(of*owx));');
s = s.split('          tq += 0.5 * (rx * (ny * N + ty * Ft) - ry * (nx * N + tx * Ft));').join(
  '          tq += 0.5 * (rx * (ny * N + ty * Ft) - ry * (nx * N + tx * Ft));' +
  ' if (global.__TQ) { var __w = 0.5*(rx*(ny*N+ty*Ft) - ry*(nx*N+tx*Ft));' +
  ' global.__TQ.wheel = (global.__TQ.wheel||0) + __w;' +
  ' global.__TQ.wheelInfo = global.__TQ.wheelInfo || [];' +
  ' global.__TQ.wheelInfo.push({rx:+rx.toFixed(4), ry:+ry.toFixed(4), N:+N.toFixed(4),' +
  ' Ft:+Ft.toFixed(4), ly:+w.ly.toFixed(4), wpy:+wp.y.toFixed(4), cy:+car.y.toFixed(4)}); }');
s = s.split('          tq += rx2 * (ny2 * N2 + tY * Ft2) - ry2 * (nx2 * N2 + tX * Ft2);').join(
  '          tq += rx2 * (ny2 * N2 + tY * Ft2) - ry2 * (nx2 * N2 + tX * Ft2);' +
  ' if (global.__TQ) { var __c = rx2*(ny2*N2+tY*Ft2) - ry2*(nx2*N2+tX*Ft2);' +
  ' global.__TQ.corner = (global.__TQ.corner||0) + __c;' +
  ' global.__TQ.cornerInfo = global.__TQ.cornerInfo || [];' +
  ' global.__TQ.cornerInfo.push({rx2:+rx2.toFixed(4), ry2:+ry2.toFixed(4), N2:+N2.toFixed(4),' +
  ' cpY:+cp.y.toFixed(4), cy:+car.y.toFixed(4)}); }');

s = s.split("require('./levels.js')").join('require(' + JSON.stringify(
  path.join(__dirname, '..', 'prototype', 'levels.js')) + ')');
fs.writeFileSync(dst, s, 'utf8');

const R = require(dst);
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
  global.__TQ = {};
  const run = R.createRun(lv, buildWithShift(dr));
  R.step(run, 1 / 60);   // 4 substeps
  const t = global.__TQ;
  console.log('dr=' + dr,
    'tool=' + (t.tool || 0).toFixed(4),
    'wheel=' + (t.wheel || 0).toFixed(4),
    'corner=' + (t.corner || 0).toFixed(4));
  if (t.wheelInfo) console.log('   wheel0:', JSON.stringify(t.wheelInfo[0]));
  if (t.cornerInfo) t.cornerInfo.slice(0, 2).forEach((c, i) => console.log('   corner' + i + ':', JSON.stringify(c)));
}

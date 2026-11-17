/* 同一形状整体下移一行，第 0 帧就出现 1% 的差异 —— 找第一个分叉的子步。
 *
 * 做法：把 game.js 复制到临时文件，在子步结束处插一个钩子记录力与速度。
 * 产品文件不动。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const SRC = path.join(__dirname, '..', 'prototype', 'game.js');
const dst = path.join(os.tmpdir(), 'game_dbg_' + Date.now() + '.js');
let s = fs.readFileSync(SRC, 'utf8');

const MARK = '      car.x += car.vx * h;';
if (s.indexOf(MARK) < 0) { console.log('MARK NOT FOUND'); process.exit(1); }
s = s.split(MARK).join(
  '      if (global.__DBG) global.__DBG.push({ fx: fx, fy: fy, tq: tq,' +
  ' vx: car.vx, vy: car.vy, w: car.w, cx: car.x, cy: car.y, ca: car.a, gw: groundWheels });\n' + MARK);

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

function substeps(dr, n) {
  global.__DBG = [];
  const run = R.createRun(lv, buildWithShift(dr));
  for (let i = 0; i < n; i++) R.step(run, 1 / 60);
  return global.__DBG.slice();
}

const A = substeps(0, 1);
const B = substeps(1, 1);
console.log('substeps captured:', A.length, B.length);
const N = Math.min(A.length, B.length);
let found = false;
for (let i = 0; i < N; i++) {
  const a = A[i], b = B[i];
  const dfx = b.fx - a.fx, dfy = b.fy - a.fy, dtq = b.tq - a.tq;
  if (Math.abs(dfx) > 1e-9 || Math.abs(dfy) > 1e-9 || Math.abs(dtq) > 1e-9) {
    console.log('第 ' + i + ' 个子步分叉:');
    console.log('  dr0 ', JSON.stringify({ fx: +a.fx.toFixed(6), fy: +a.fy.toFixed(6),
      tq: +a.tq.toFixed(6), gw: a.gw, ca: +a.ca.toFixed(6) }));
    console.log('  dr1 ', JSON.stringify({ fx: +b.fx.toFixed(6), fy: +b.fy.toFixed(6),
      tq: +b.tq.toFixed(6), gw: b.gw, ca: +b.ca.toFixed(6) }));
    console.log('  Δ   ', JSON.stringify({ dfx: +dfx.toFixed(6), dfy: +dfy.toFixed(6),
      dtq: +dtq.toFixed(6) }));
    found = true;
    break;
  }
}
if (!found) console.log('前 ' + N + ' 个子步的力完全一致');

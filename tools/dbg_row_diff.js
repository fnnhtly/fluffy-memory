/* 同一个形状整体下移一行，物理为什么变了？逐帧对照 dr=0 与 dr=+1。 */
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

function trace(dr, n) {
  const build = buildWithShift(dr);
  const run = R.createRun(lv, build);
  const out = [];
  const surf = run.terrain.surfaceY(run.car.x);
  // 轮子世界坐标（车心 + 局部，未旋转时）
  const wheels = run.car.wheels.map(w => ({
    lx: w.lx, ly: w.ly, r: w.def.radius,
    wy: run.car.y + w.ly - w.def.radius
  }));
  out.push({ step: -1, carY: +run.car.y.toFixed(4), surf: +surf.toFixed(4),
    wheelBottomGap: wheels.map(w => +(w.wy - surf).toFixed(4)) });
  for (let i = 0; i < n; i++) {
    R.step(run, 1 / 60);
    out.push({
      step: i,
      carX: +run.car.x.toFixed(4), carY: +run.car.y.toFixed(4),
      vx: +run.car.vx.toFixed(4), vy: +run.car.vy.toFixed(4),
      a: +(run.car.a * 180 / Math.PI).toFixed(3),
      ground: run.car.groundWheels
    });
  }
  return out;
}

const A = trace(0, 12);
const B = trace(1, 12);
for (let i = 0; i < A.length; i++) {
  const a = A[i], b = B[i];
  const same = JSON.stringify({ x: a.carX, y: a.carY, vx: a.vx, vy: a.vy, a: a.a }) ===
               JSON.stringify({ x: b.carX, y: b.carY, vx: b.vx, vy: b.vy, a: b.a });
  console.log((same ? '  ' : '≠ ') + 'step ' + String(a.step).padStart(2) +
    '  dr0 ' + JSON.stringify({ x: a.carX, y: a.carY, vx: a.vx, vy: a.vy, a: a.a, g: a.ground }) +
    '  dr1 ' + JSON.stringify({ x: b.carX, y: b.carY, vx: b.vx, vy: b.vy, a: b.a, g: b.ground }));
}
console.log('spawn dr0:', JSON.stringify(A[0]));
console.log('spawn dr1:', JSON.stringify(B[0]));

/* 引擎有一条隐藏的耦合：零件局部坐标 ly = (BUILD_ROWS-1)/2 - r。
 *
 * 所以"把 BUILD_ROWS 从 8 改成 6"会让所有零件的 ly 整体 +1，
 * 而力矩是按 `ry = wp.y - car.y`（相对**车体局部原点**）算的 ——
 * world 位置完全不变，力臂却变了 1 米，结果 1-1 从 3 星变成翻车。
 *
 * 这不是"行号敏感"，是**把力矩算在局部原点上**而不是算在质心上。
 * 本探针验证：把每一关的 spéс 行号统一 -1，让 ly 恢复原值，
 * 物理应当**逐位相同**（同 t、同 x、同角度、同星级）。
 */
const R = require('../prototype/game.js');
const levels = require('../prototype/levels.js');

const ROWS = R.BUILD_ROWS;
const OLD_ROWS = 8;
const SHIFT = (ROWS - 1) / 2 - (OLD_ROWS - 1) / 2;   // 6 行时 = -1

function buildFrom(spec, rowShift) {
  const build = R.newBuild();
  for (const part of Object.keys(spec)) {
    if (part.startsWith('_')) continue;
    spec[part].forEach(([r, c]) => {
      const key = (r + rowShift) + ',' + c;
      const isInner = R.PARTS[part] && R.PARTS[part].inner;
      if (!build.cells[key]) { build.cells[key] = { part, dir: 0 }; build.order.push(key); }
      if (isInner) build.cells[key].inner = part;
    });
  }
  return build;
}

function localCoords(spec, rowShift) {
  const b = buildFrom(spec, rowShift);
  const car = R.buildVehicle(null, b);
  if (!car) return null;
  return car.parts.map(p => p.part + '@' + p.lx.toFixed(2) + ',' + p.ly.toFixed(2)).join(' ');
}

const out = [];
for (const [name, spec] of Object.entries(R.SPECS)) {
  const a = localCoords(spec, 0);
  const b = localCoords(spec, SHIFT);
  out.push({ name, shift: SHIFT, identical: a === b, before: a, after: b });
}
console.log('BUILD_ROWS =', ROWS, ' shift =', SHIFT);
out.forEach(o => console.log((o.identical ? '✓' : '✗') + ' ' + o.name.padEnd(6) +
  '  局部坐标' + (o.identical ? '完全一致' : '变了！')));
const bad = out.filter(o => !o.identical);
if (bad.length) {
  bad.slice(0, 2).forEach(o => {
    console.log('  ' + o.name + ' before:', o.before);
    console.log('  ' + o.name + ' after :', o.after);
  });
}

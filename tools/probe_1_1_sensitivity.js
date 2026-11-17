/* 1-1 的标准解是"刀尖上赢"吗？
 *
 * 观察到：同一个形状整体上移/下移一行（局部坐标完全不变），1-1 的结果就从
 * "3 星通关"变成"车翻了、猪掉了"。而两边的差在第 0 帧只有 1e-4 量级 ——
 * 这不像"某处用了绝对坐标"，更像**混沌放大**。
 *
 * 这个探针给出结论：给 spawn 高度加一个 1e-9 的扰动，跑 20 次看结果分布。
 * 如果结果就分叉了，那问题是"这辆车本来就在临界点上"，
 * 跟行号无关，必须从物理/关卡上解决。
 */
const R = require('../prototype/game.js');
const levels = require('../prototype/levels.js');
const lv = levels[0];

function build() {
  const b = R.newBuild();
  const spec = R.SPECS['1-1'];
  for (const part of Object.keys(spec)) {
    if (part.startsWith('_')) continue;
    spec[part].forEach(([r, c]) => {
      const key = r + ',' + c;
      const isInner = R.PARTS[part] && R.PARTS[part].inner;
      if (!b.cells[key]) { b.cells[key] = { part, dir: 0 }; b.order.push(key); }
      if (isInner) b.cells[key].inner = part;
    });
  }
  return b;
}

function run(perturbY) {
  const b = build();
  const r = R.createRun(lv, b);
  r.car.y += perturbY;
  for (let i = 0; i < 900; i++) {
    R.step(r, 1 / 60);
    if (r.phase !== 'run') break;
  }
  return { result: r.result, stars: r.stars, reason: r.failReason || 'ok',
    t: +r.time.toFixed(2), x: +r.car.x.toFixed(2),
    a: +(r.car.a * 180 / Math.PI).toFixed(0) };
}

const cases = [0, 0, 1e-9, -1e-9, 1e-6, -1e-6, 1e-3, -1e-3, 1e-2, -1e-2];
for (const p of cases) {
  console.log((p === 0 ? '  基线' : 'δ=' + String(p).padStart(8)) + '  ' + JSON.stringify(run(p)));
}

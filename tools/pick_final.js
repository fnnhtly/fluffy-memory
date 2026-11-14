/* 终点距离定下来之后，挑最稳的标准解。
 * 目标：±0.8 秒方阵全绿（玩家手快/手慢都成），且弧顶尽量低（车不出画面）。
 */
const T = require('./tune_1_6_wall.js');
const R = T.R;

const CFG = { gapW: 1, wallUp: 4 };
const GOAL_OFF = Number(process.argv[2] || 2);

function lv0() {
  const lv = T.build(CFG);
  lv.goal = { col: lv._platStart + GOAL_OFF, row: lv._platTopRow - 1 };
  lv._goalCol = lv.goal.col;
  return lv;
}
const base = lv0();
const ter = R.makeTerrain(base);
const platY = ter.surfaceY(base._platStart + 0.5);

function go(td, tp) {
  const lv = lv0();
  const b = T.makeCar(lv, { balloons: 6, sandbags: 3 });
  return T.run(lv, b, [{ t: +td.toFixed(2), do: 'drop', n: 3 }, { t: +tp.toFixed(2), do: 'pop', n: 1 }], 30);
}
function jitter(td, tp, r) {
  const pts = [];
  for (let a = -r; a <= r + 1e-9; a += r / 2) for (let b = -r; b <= r + 1e-9; b += r / 2) pts.push([td + a, tp + b]);
  return pts.filter(p => go(p[0], p[1]).res !== 'win').length;
}

console.log(`终点 c${base._goalCol}（墙角+${GOAL_OFF}）台面 y=${platY.toFixed(2)}`);
const rows = [];
for (let td = 2.5; td <= 6.01; td += 0.25) {
  for (let tp = td + 1.5; tp <= td + 6.01; tp += 0.25) {
    const r = go(td, tp);
    if (r.res !== 'win') continue;
    rows.push({ td: +td.toFixed(2), tp: +tp.toFixed(2), above: r.maxY - platY, t: r.t, bad8: jitter(td, tp, 0.8), bad5: jitter(td, tp, 0.5) });
  }
}
console.log(`通关格 ${rows.length}`);
for (const [tag, key] of [['±0.8s', 'bad8'], ['±0.5s', 'bad5']]) {
  const safe = rows.filter(r => r[key] === 0).sort((a, b) => a.above - b.above);
  console.log(`\n${tag} 全绿 ${safe.length} 个，弧顶从低到高：`);
  safe.slice(0, 12).forEach(r => console.log(`  扔@${r.td} 扎@${r.tp}  弧顶 台+${r.above.toFixed(2)}m  用时${r.t.toFixed(1)}s`));
}

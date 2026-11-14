/* 1-6「抬个头」的四格判定 —— 必须**四条同时成立**，这关才算在教气球。
 *
 *   A 只带气球（不扔沙袋、不扎）      → 必须 fail
 *   B 只带沙袋（不扎、也不升空）      → 必须 fail
 *   C 两样都有但什么都不做            → 必须 fail
 *   D 扔沙袋但不扎气球                → 必须 fail   ← 这条最容易漏！
 *   E 扔沙袋 + 扎 1 个气球            → 必须 win
 *
 * 为什么 D 是重点：获胜判定是 `car.x >= goal.col`，**与高度完全无关**。
 * 气球让车一直往上飘，x 也一直在涨（vx≈2 m/s），所以"什么都不做就飘到终点"
 * 是完全可能的 —— 那就变成"扎气球是可选项"，整个玩法塌掉。
 * 唯一拦住它的是天花板（flew_away）和车身卡在台面侧面。
 * 所以这两种"意外通关"必须逐条量出来。
 */
const T = require('./tune_1_6_plat.js');
const R = T.R;

const o = { gapW: 3, platUp: 2 };

function go(sched, opt) {
  const lv = T.build(o);
  if (opt && opt.noBag) lv.partsBox.sandbag = 0;
  if (opt && opt.noBalloon) lv.partsBox.balloon = 0;
  const nb = opt && opt.balloons !== undefined ? opt.balloons : 6;
  const bg = opt && opt.bags !== undefined ? opt.bags : 3;
  const b = T.makeCar(lv, { balloons: nb, sandbags: bg });
  return T.run(lv, b, sched, 26);
}

const lv = T.build(o);
const ter = R.makeTerrain(lv);
console.log(`沟 c13..c15 / 高台 c${lv._platStart}.. 顶 y=${ter.surfaceY(lv._platStart + 0.5).toFixed(2)}` +
  ` / 助跑面 y=${ter.surfaceY(11.5).toFixed(2)} / 终点 c${lv._goalCol} / 天花板 y>${ter.rows + 6}`);

function row(tag, r, want) {
  const ok = want === 'fail' ? r.res !== 'win' : r.res === 'win';
  console.log(`  ${ok ? '✅' : '❌'} ${tag.padEnd(30)} ${String(r.res).padEnd(12)} x=${r.x.toFixed(2).padStart(6)} ` +
    `maxX=${r.maxX.toFixed(1).padStart(5)} maxY=${r.maxY.toFixed(1).padStart(5)} 破=${r.pops} 袋=${r.dropped}`);
  return ok;
}

let pass = 0, total = 0;
function check(tag, r, want) { total++; if (row(tag, r, want)) pass++; }

console.log('\n=== 四格判定 ===');
check('A 只带气球（不扔不扎）', go(null, { noBag: true }), 'fail');
check('B 只带沙袋（不扎）', go(null, { noBalloon: true }), 'fail');
check('C 都有但什么都不做', go(null), 'fail');
check('D 扔沙袋但**不扎**气球', go([{ t: 3.0, do: 'drop', n: 3 }]), 'fail');
check('D2 扔沙袋@5.0 不扎', go([{ t: 5.0, do: 'drop', n: 3 }]), 'fail');

console.log('\n=== 正解：扔沙袋 + 扎 1 个 ===');
check('E 扔@3.0 + 扎1@7.0', go([{ t: 3.0, do: 'drop', n: 3 }, { t: 7.0, do: 'pop', n: 1 }]), 'win');
check('E 扔@4.0 + 扎1@8.0', go([{ t: 4.0, do: 'drop', n: 3 }, { t: 8.0, do: 'pop', n: 1 }]), 'win');

console.log('\n=== 其他造法不能通关 ===');
check('F 6 气球 + 1 沙袋（净重 0.2，几乎不沉）', go(null, { bags: 1 }), 'fail');
check('G 3 气球 + 3 沙袋（净重 3.75，升不起来）', go([{ t: 3.0, do: 'drop', n: 3 }], { balloons: 3 }), 'fail');
check('H 6 气球 + 3 沙袋，只扎 2 个（不够沉）', go([{ t: 3.0, do: 'drop', n: 3 }, { t: 7.0, do: 'pop', n: 2 }]), 'fail');

console.log(`\n${pass}/${total} 条满足设计意图`);

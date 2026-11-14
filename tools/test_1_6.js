/* 1-6「抬个头」的设计判定 —— 对**真关卡文件 + 真 SPECS** 跑，不用调参脚手架。
 *
 * 这一关教"高度控制"，所以要同时证明：
 *   ① 标准解通关、拿满三星
 *   ② 只带气球 → 飘走
 *   ③ 只带沙袋 → 爬不上墙
 *   ④ 两样都带但什么都不做 → 撞墙
 *   ⑤ 扔了沙袋但不扎气球 → 从台上飞过去（fail，靠终点高度门槛）
 *   ⑥ 气球不够 / 沙袋不够 都不行
 *   ⑦ 标准解两个动作各 ±0.5 秒仍然通关
 *   ⑧ 关卡结构本身成立（高台够高、沟够深、零件箱够用）
 *
 * ⑤ 是最容易漏的：没有终点高度门槛时，"挂气球飘过终点线"也判 win，
 * 那这关教的就是"挂机"。
 *
 * ⚠ 一个排零件时的坑：`_stacks` 是**每格**的堆叠数，
 * 所以 balloon: [[3,1],[3,2]] + _stacks.balloon = 3 是 6 个气球，不是 3 个。
 * 想要 3 个气球就只给一格。
 */
const R = require('../prototype/game.js');
const LV = require('../levels/06.json');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('PASS  ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('FAIL  ' + name + (extra ? '  ' + extra : '')); }
}

const specStd = R.SPECS['1-6'];

/* 按"总共几个气球 / 几个沙袋"造标准车（3 框 + 木轮 + 猪） */
function mk(opt) {
  const spec = {
    wood_frame: [[4, 1], [4, 2], [4, 3]],
    wood_wheel: [[5, 1], [5, 3]],
    pig: [[4, 2]]
  };
  const nb = opt.balloons || 0;
  if (nb > 0) {
    const cells = nb <= 3 ? [[3, 1]] : [[3, 1], [3, 2]];
    spec.balloon = cells;
    spec._stacks = Object.assign(spec._stacks || {}, { balloon: Math.min(3, nb) });
  }
  const ng = opt.sandbags || 0;
  if (ng > 0) {
    spec.sandbag = [[5, 2]];
    spec._stacks = Object.assign(spec._stacks || {}, { sandbag: Math.min(3, ng) });
  }
  if (opt.dropAt !== undefined && ng > 0) spec._drops = [{ t: opt.dropAt, n: ng }];
  if (opt.popAt !== undefined && nb > 0) spec._pops = [{ t: opt.popAt, n: 1 }];
  return spec;
}
function run(spec) { return R.simulate(LV, spec, { maxTime: 40 }); }

// ---- ① 标准解 ----
const std = run(specStd);
ok(std.result === 'win', '标准解通关', `x=${std.car.x.toFixed(2)} t=${std.time.toFixed(2)}`);
ok(std.stars === 3, '标准解拿满三星', `goals=${JSON.stringify(std.starGoals)}`);
ok(std.balloonPops === 1, '标准解只扎 1 个气球', `实际 ${std.balloonPops}`);
ok(std.sandbagsDropped === 3, '标准解把 3 个沙袋全扔了', `实际 ${std.sandbagsDropped}`);

// ---- ② 只带气球 ----
const onlyBalloon = run(mk({ balloons: 6 }));
ok(onlyBalloon.result !== 'win', '只带气球不通关', `${onlyBalloon.result}/${onlyBalloon.failReason}`);

// ---- ③ 只带沙袋 ----
const onlyBag = run(mk({ sandbags: 3 }));
ok(onlyBag.result !== 'win', '只带沙袋不通关', `${onlyBag.result}/${onlyBag.failReason}`);

// ---- ④ 都有但不操作 ----
const idle = run(mk({ balloons: 6, sandbags: 3 }));
ok(idle.result !== 'win', '两样都带但不操作不通关', `${idle.result}/${idle.failReason}`);

// ---- ⑤ 扔沙袋但不扎气球 ----
const dropOnly = run(mk({ balloons: 6, sandbags: 3, dropAt: 4.5 }));
ok(dropOnly.result !== 'win', '扔沙袋但不扎气球不通关（终点高度门槛）', `${dropOnly.result}/${dropOnly.failReason}`);
ok(dropOnly.events.some(e => /over_goal/.test(e)), '确实飞过了终点线（是被高度门槛拦下的）');

// ---- ⑥ 数量不够 ----
const oneBag = run(mk({ balloons: 6, sandbags: 1, dropAt: 4.5, popAt: 8.0 }));
ok(oneBag.result !== 'win', '只带 1 个沙袋不通关（升得不够）', `${oneBag.result}/${oneBag.failReason}`);
const fewBalloon = run(mk({ balloons: 3, sandbags: 3, dropAt: 4.5, popAt: 8.0 }));
ok(fewBalloon.result !== 'win', '只带 3 个气球不通关（升不起来）', `${fewBalloon.result}/${fewBalloon.failReason}`);

// ---- ⑦ 容错 ----
let bad = 0, total = 0;
const badList = [];
for (const dd of [-0.5, 0, 0.5]) {
  for (const dp of [-0.5, 0, 0.5]) {
    total++;
    const r = run(mk({ balloons: 6, sandbags: 3, dropAt: +(4.5 + dd).toFixed(2), popAt: +(8.0 + dp).toFixed(2) }));
    if (r.result !== 'win') { bad++; badList.push(`扔${(4.5 + dd).toFixed(1)}/扎${(8.0 + dp).toFixed(1)}→${r.result}/${r.failReason}`); }
  }
}
ok(bad === 0, '标准解 ±0.5 秒抖动全部仍通关', `${total - bad}/${total}${bad ? '  ' + badList.join(', ') : ''}`);

// ---- ⑧ 关卡结构 ----
const ter = R.makeTerrain(LV);
const platY = ter.surfaceY(LV.goal.col + 0.5);
const runY = ter.surfaceY(10.5);
ok(platY - runY > 2.5, '高台比助跑面高 ≥2.5 米（必须升空）', `${(platY - runY).toFixed(2)}m`);
/* c12 是一格宽的沟，平滑核会把它填成一个 2 米高的鼓包（surfaceY(12)≈0 但 12.2 是 2.0）。
 * 那不是 bug —— 角点碰撞本来就该让车"架"在坡上而不是掉下去。
 * 所以这里断言的是"沟底确实到 0"，而不是"沟两壁都是垂直的"。 */
ok(ter.surfaceY(12) < 0.5, '沟底确实到 0（不是被平滑填平）', `c12=${ter.surfaceY(12).toFixed(2)}`);
ok(Math.abs(ter.surfaceSlope(12.5)) > 3, '墙面够陡（轮子爬不上去）', `slope=${ter.surfaceSlope(12.5).toFixed(1)}`);
ok(LV.partsBox.balloon >= 6 && LV.partsBox.sandbag >= 3, '零件箱里有足够的气球和沙袋',
  `气球${LV.partsBox.balloon} 沙袋${LV.partsBox.sandbag}`);
ok(LV.challenge && LV.challenge.type === 'allSandbags', '三星条件是「沙袋全扔」', JSON.stringify(LV.challenge));
ok(LV.boxes.length === 1, '有一个木箱', `boxes=${LV.boxes.length}`);

console.log(`\nASSERTS ${pass} / ${pass + fail}`);
if (fail) process.exitCode = 1;

/* 用目标漏洞反过来验证「不升空不能过关」这条硬规则。
 *
 * 上面 trace_3b 已经暴露：3 气球 + 3 沙袋的净重是 5.25（扔沙袋后 2.85），
 * 按说不该升空，但实测车在 x≈11.98 处悬停 —— 因为**车壳四角的接触判定**
 * 把车撑在了崖壁的斜面上（`surfaceY` 在 c12 附近被平滑成一个 2 米高的鼓包）。
 * 也就是说沟不"真"，车是"架在坡上"而不是"掉下去"。
 *
 * 这不算 bug（角点本该有碰撞），但意味着关卡设计参数要能看出这一点。
 * 这个脚本就是那把尺子：固定造法扫"扎的时刻"，把"架住"和"掉下去"分开。
 */
const R = require('../prototype/game.js');
const LV = require('../levels/06.json');
const ter = R.makeTerrain(LV);

console.log('地表 c10..c15:');
for (let c = 10; c <= 15; c += 0.5) console.log(`  x=${c.toFixed(1)} surf=${ter.surfaceY(c).toFixed(2)} slope=${ter.surfaceSlope(c).toFixed(2)}`);

function mk(nb) {
  return {
    wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]],
    balloon: nb > 3 ? [[3, 1], [3, 2]] : [[3, 1]],
    sandbag: [[5, 2]],
    _stacks: { balloon: Math.min(3, nb), sandbag: 3 },
    _drops: [{ t: 4.5, n: 3 }], _pops: [{ t: 8.0, n: 1 }]
  };
}

console.log('\n气球数 → 结果：');
for (const nb of [3, 6]) {
  const b = R.newBuild();
  R.applySpec(LV, b, mk(nb));
  const car = R.buildVehicle(LV, b);
  const st = R.simulate(LV, mk(nb), { maxTime: 40 });
  console.log(`  ${nb} 个: mass=${car.mass.toFixed(2)} lift=${car.liftMass.toFixed(2)} net=${car.netMass.toFixed(2)}` +
    ` → ${st.result || st.failReason} x=${st.car.x.toFixed(2)} maxY=${Math.max.apply(null, st.replay.map(r => r.y)).toFixed(1)} stars=${st.stars}`);
}

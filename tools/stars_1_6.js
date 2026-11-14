/* 1-6 的三颗星要能"分别拿到"（参考的累计制）。
 *
 * 星级分工：
 *   ★   到达        —— 过墙就算
 *   ★★  木箱        —— 要**落得早**（扎得早），箱子在台面靠墙那一段
 *   ★★★ 沙袋全扔    —— 扔满 3 个
 *
 * 所以标准解（扔@4.5 扎@8.0）应该只拿 2 星，
 * 而"扔@4.5 扎得更早"这种精调解才拿 3 星。
 * 这里扫的是：箱子放哪一格、扎得多早，能出现「3 星」且不和「2 星」重合。
 */
const R = require('../prototype/game.js');
const base = require('../levels/06.json');

function mk(balloons, sandbags, dropAt, popAt) {
  return {
    wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]],
    balloon: [[3, 1], [3, 2]], sandbag: [[5, 2]],
    _stacks: { balloon: 3, sandbag: 3 },
    _drops: [{ t: dropAt, n: sandbags }], _pops: [{ t: popAt, n: 1 }]
  };
}

for (const dc of [2, 3, 4]) {
  const LV = JSON.parse(JSON.stringify(base));
  LV.boxes = [{ col: LV.goal.col + dc, row: LV.goal.row }];
  console.log(`\n=== 箱@goal+${dc} (c${LV.goal.col + dc}) ===`);
  let stars3 = [];
  for (let tp = 6.0; tp <= 11.01; tp += 0.25) {
    const st = R.simulate(LV, mk(6, 3, 4.5, tp), { maxTime: 40 });
    if (st.result === 'win') stars3.push({ tp: +tp.toFixed(2), stars: st.stars, box: st.boxesGot, x: st.car.x });
  }
  stars3.forEach(s => console.log(`  扎@${s.tp}  ${s.stars}星 箱=${s.box} 落点x=${s.x.toFixed(2)}`));
  const three = stars3.filter(s => s.stars === 3);
  console.log(`  → 三星窗口 ${three.length} 个点` + (three.length ? `：扎@${three.map(s => s.tp).join(',')}` : ''));
}

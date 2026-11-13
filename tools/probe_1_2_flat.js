/* 1-2「按一下」第三版：平地起步，打气筒是唯一的推进力。
 *
 * 前两版（台阶 / 深坑）都能做到"不按过不去"，但成功窗口只有 7%~27%：
 * 车在自由下滑，玩家必须在一个 0.2~0.4 秒的窗口里按下才刚好落点正确。
 * 那是"考精确操作"，不是教学 —— 玩家学到的是"这游戏要卡帧"，
 * 而他应该学到的是"打气筒把我往前顶了一下"。
 *
 * 所以换思路：**把地形放平**。车静止不动，唯一能推动它的就是打气筒。
 * 这样"不按 = 永远停在原地"是结构性的，不是数值卡出来的；
 * 而"什么时候按"变成完全自由 —— 窗口越宽，教学越干净。
 *
 * 这个脚本量：1 个朝右 / 朝上 / 2 个 分别能推多远，以及按下的时间窗。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');

const BASE = L[1];
const COLS = 40, ROWS = 14;

function makeLevel(paint, goal, extra) {
  const g = Array.from({ length: ROWS }, () => new Array(COLS).fill('.'));
  const put = (r, c, ch) => { if (r >= 0 && r < ROWS && c >= 0 && c < COLS) g[r][c] = ch; };
  g[4][1] = 'S';
  // 全程平地（row 8 起为实体），没有任何下坡
  for (let c = 0; c < COLS; c++) for (let r = 8; r < ROWS; r++) g[r][c] = '#';
  paint(put);
  g[goal.row][goal.col] = 'E';
  const lv = JSON.parse(JSON.stringify(BASE));
  lv.mapRows = g.map(r => r.join(''));
  lv.goal = { col: goal.col, row: goal.row };
  lv.materials = [{ surfaceRow: 8, cols: [0, COLS - 1], type: 'mud' }];
  lv.partsBox = { wood_frame: 3, wood_wheel: 2, pump: 4, pig: 1 };
  lv.boxes = [];
  lv.challenge = { type: 'none' };
  Object.assign(lv, extra || {});
  return lv;
}

function simulate(lv, spec, dir, presses, maxT) {
  RAP.resetParams({});
  const b = RAP.newBuild();
  RAP.applySpec(lv, b, spec);
  const st = RAP.createRun(lv, b);
  if (dir !== null && dir !== undefined) {
    st.car.parts.filter(p => p.def === RAP.PARTS.pump).forEach(p => { p.dir = dir; });
  }
  st.spawnGrace = 0.9;
  const dt = 1 / 60;
  const acts = (presses || []).slice().sort((a, b2) => a.t - b2.t);
  let ai = 0;
  let maxX = -1e9;
  while (st.phase === 'run' && st.time < (maxT || 20)) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      if (acts[ai].kind === 'press') RAP.pressInteract(st, 1);
      else RAP.releaseInteract(st, 1);
      ai++;
    }
    RAP.step(st, dt);
    if (st.car) maxX = Math.max(maxX, st.car.x);
  }
  return { result: st.result || '未结束', reason: st.failReason || '', time: st.time,
           x: st.car ? st.car.x : null, maxX: maxX === -1e9 ? null : maxX };
}

const FRAMES = { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]] };
const PR = Object.assign({}, FRAMES, { pump: [[3, 2]] });          // 1 个
const P2R = Object.assign({}, FRAMES, { pump: [[3, 1], [3, 3]] }); // 2 个

const lv = makeLevel(() => {}, { col: 9, row: 4 });

console.log('平地起步，目标在 col 9（起点 col 1）');
console.log('== 不同朝向能推多远（按一次，按住 0.8s）==');
[['不按', null], ['朝右', 0], ['朝上', 1], ['朝左', 2]].forEach(([tag, d]) => {
  const r = simulate(lv, PR, d, d === null ? [] : [{ t: 1.0, kind: 'press' }, { t: 1.8, kind: 'release' }]);
  console.log('  ' + tag.padEnd(6) + r.result.padEnd(5) + (r.reason ? '(' + r.reason + ')' : '').padEnd(9) +
    ' 最远 x=' + (r.maxX === null ? '—' : r.maxX.toFixed(2)));
});

console.log('\n== 按下时机窗口（朝右，按住 0.8s，目标 col 9）==');
{
  const ok = [];
  for (let t0 = 0.2; t0 <= 3.0; t0 += 0.2) {
    const r = simulate(lv, PR, 0, [{ t: t0, kind: 'press' }, { t: t0 + 0.8, kind: 'release' }]);
    if (r.result === 'win') ok.push(t0);
  }
  console.log('  成功 ' + ok.length + '/15，按下时间 ' + (ok.length ? ok[0].toFixed(1) + '~' + ok[ok.length - 1].toFixed(1) + 's' : '无'));
}

console.log('\n== 按住时长窗口（朝右，@1.0s 按下，目标 col 9）==');
{
  const ok = [];
  for (let h = 0.1; h <= 1.0; h += 0.1) {
    const r = simulate(lv, PR, 0, [{ t: 1.0, kind: 'press' }, { t: 1.0 + h, kind: 'release' }]);
    if (r.result === 'win') ok.push(h);
  }
  console.log('  成功 ' + ok.length + '/10，按住时长 ' + (ok.length ? ok[0].toFixed(1) + '~' + ok[ok.length - 1].toFixed(1) + 's' : '无'));
}

console.log('\n== 目标距离 vs 一次喷气 ==');
[7, 9, 11, 13, 15].forEach(col => {
  const lv2 = makeLevel(() => {}, { col: col, row: 4 });
  const r = simulate(lv2, PR, 0, [{ t: 1.0, kind: 'press' }, { t: 1.8, kind: 'release' }]);
  const r2 = simulate(lv2, P2R, 0, [{ t: 1.0, kind: 'press' }, { t: 1.8, kind: 'release' }]);
  console.log('  col ' + String(col).padStart(2) + '（约 ' + (col - 4) + ' m）  1个:' + r.result.padEnd(5) +
    '  2个:' + r2.result);
});

console.log('\n== 连按两次能走多远（要跨越更远距离时用）==');
{
  const ok = [];
  for (let col = 9; col <= 24; col += 1) {
    const lv2 = makeLevel(() => {}, { col: col, row: 4 });
    const r = simulate(lv2, PR, 0, [
      { t: 0.6, kind: 'press' }, { t: 1.4, kind: 'release' },
      { t: 2.0, kind: 'press' }, { t: 2.8, kind: 'release' }
    ], 20);
    if (r.result === 'win') ok.push(col);
  }
  console.log('  两次喷气能到的 col：' + (ok.length ? ok[0] + '~' + ok[ok.length - 1] : '无'));
}

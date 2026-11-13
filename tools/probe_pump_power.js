/* 打气筒的能力边界：朝向、按住时长、同组个数 → 抬升/位移。
 *
 * 为什么必须量：1-2 叫「按一下」，但标准解一次没按就三星通关了
 * （见 tools/probe_level_1_2.js 的输出）。要把它改成"必须按"，
 * 得先知道按一下究竟能抬多高、多喷几个能抬多高，
 * 否则设计出来的关卡会是"按了也过不去"。
 *
 * 参考公式：releaseInteract 里 dv = pumpImpulse × (0.35 + 0.65×蓄力)，
 * 并且**同组每个零件各自推一次**，所以 n 个朝上的打气筒 ≈ n 倍的 dv。
 * 重力 16 m/s²，理论抬升 = dv² / (2×16)。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');

function flatLevel() {
  const cols = 40, rows = 14;
  const g = Array.from({ length: rows }, () => new Array(cols).fill('.'));
  g[4][1] = 'S';
  for (let r = 8; r < rows; r++) for (let c = 0; c < cols; c++) g[r][c] = '#';
  g[4][20] = 'E';
  const lv = JSON.parse(JSON.stringify(L[1]));
  lv.mapRows = g.map(r => r.join(''));
  lv.goal = { col: 20, row: 4 };
  lv.materials = [{ surfaceRow: 8, cols: [0, cols - 1], type: 'mud' }];
  lv.boxes = [];
  lv.partsBox = { wood_frame: 4, wood_wheel: 2, pump: 4, pig: 1 };
  lv.challenge = { type: 'none' };
  return lv;
}

const LV = flatLevel();
const DIR = { right: 0, up: 1, left: 2, down: 3 };

/** 造一台车：3 个竖排木框 + 两个木轮 + 猪，打气筒放在 cells 里，全部设成 dir。 */
function build(pumpCells, dir) {
  const spec = {
    wood_frame: [[4, 1], [4, 2], [4, 3]],
    wood_wheel: [[5, 1], [5, 3]],
    pig: [[4, 2]],
    pump: pumpCells
  };
  RAP.resetParams({});
  const b = RAP.newBuild();
  RAP.applySpec(LV, b, spec);
  const st = RAP.createRun(LV, b);
  // 放置时的默认朝向不一定是我们想测的，直接改（parts 和 groups 里是同一批对象）
  st.car.parts.filter(p => p.def === RAP.PARTS.pump).forEach(p => { p.dir = dir; });
  st.spawnGrace = 0.9;
  return st;
}

/** 跑 6 秒，t0 时按下、t0+hold 时松开，返回 {lift, dx, result}。 */
function fire(st, hold, t0) {
  const dt = 1 / 60;
  const baseY = st.car.y, baseX = st.car.x;
  let peak = baseY, pressed = false, released = false, lifted = 0;
  while (st.phase === 'run' && st.time < 6) {
    if (!pressed && st.time >= t0) { RAP.pressInteract(st, 1); pressed = true; }
    if (pressed && !released && st.time >= t0 + hold) {
      RAP.releaseInteract(st, 1); released = true;
      lifted = st.car ? Math.max(0, st.car.vy) : 0;
    }
    RAP.step(st, dt);
    if (st.car) peak = Math.max(peak, st.car.y);
  }
  return { lift: peak - baseY, dx: (st.car ? st.car.x : baseX) - baseX, result: st.result || '未结束', vUp: lifted };
}

console.log('== 朝向（1 个打气筒，按住 0.6s）==');
console.log('朝向'.padEnd(7) + '抬升 m'.padStart(9) + '水平 m'.padStart(10) + '  松手瞬间 v↑');
['up', 'down', 'left', 'right'].forEach(name => {
  // 朝上的打气筒装在车顶（4,0 那格悬空不行）—— 装在 3,2（车尾），朝向仍可由 dir 控制
  const st = build([[3, 2]], DIR[name]);
  const r = fire(st, 0.6, 1.2);
  console.log(name.padEnd(7) + r.lift.toFixed(2).padStart(9) + r.dx.toFixed(2).padStart(10) +
    '  ' + r.vUp.toFixed(2));
});

console.log('\n== 按住时长 → 抬升（1 个朝上）==');
[0.05, 0.1, 0.2, 0.4, 0.6, 0.8].forEach(hold => {
  const r = fire(build([[3, 2]], 1), hold, 1.2);
  console.log('  hold ' + hold.toFixed(2) + 's → 抬升 ' + r.lift.toFixed(2) + ' m，松手 v↑ ' + r.vUp.toFixed(2));
});

console.log('\n== 同组个数 → 抬升（全朝上，按住 0.8s 满蓄力）==');
[
  [[3, 2]],
  [[3, 1], [3, 3]],
  [[3, 1], [3, 2], [3, 3]]
].forEach(cells => {
  const r = fire(build(cells, 1), 0.8, 1.2);
  console.log('  ' + cells.length + ' 个 → 抬升 ' + r.lift.toFixed(2) + ' m（松手 v↑ ' + r.vUp.toFixed(2) + '）');
});

console.log('\n== 结论：能越过几格高的墙 ==');
console.log('  格高 = 1.0 m。实测抬升上限见上表，取保守值：');
[[[3, 2]], [[3, 1], [3, 3]], [[3, 1], [3, 2], [3, 3]]].forEach(cells => {
  const r = fire(build(cells, 1), 0.8, 1.2);
  console.log('  ' + cells.length + ' 个朝上 → 约 ' + Math.floor(r.lift) + ' 格');
});

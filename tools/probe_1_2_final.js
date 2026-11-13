/* 1-2 定稿：坑深 2 格 + 一次朝上喷气。
 *
 * 从 probe_1_2_terrain2.js 的实测矩阵里，唯一干净的一行是
 *   「中段坑挖深 2 格」：不装打气筒 → stuck 失败；装了但朝上喷一次 → 通关。
 * 这正好兑现关卡名「按一下」——必须按，且按一下就好。
 *
 * 但这个改动会让原来那颗「不按打气筒」的星变成**不可能达成**
 * （要过关就必须按）。所以第三颗星要换成本脚本顺带标定的「限时」。
 *
 * 这里量三件事：
 *   1. 朝上 vs 朝右 vs 不按 —— 哪一种能过
 *   2. 一次按下的时间窗（太早/太晚都不行）—— 说明它是个"时机"关卡
 *   3. 通关时间分布 —— 用来定「限时」星的阈值（要留出余量，不能卡在极限）
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');

const BASE = L[1];
const COLS = BASE.grid.cols, ROWS = BASE.grid.rows;

// 在原始地形上把 col 6..9 挖深 2 格
const g = BASE.mapRows.map(r => r.split(''));
for (let c = 6; c <= 9; c++) {
  for (let r = 7; r < 7 + 2; r++) if (r < ROWS) g[r][c] = '.';
}
const ROWS_PIT2 = g.map(r => r.join(''));

function level(challenge) {
  const lv = JSON.parse(JSON.stringify(BASE));
  lv.mapRows = ROWS_PIT2;
  lv.boxes = [];
  lv.challenge = challenge || { type: 'none' };
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
  while (st.phase === 'run' && st.time < (maxT || 40)) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      if (acts[ai].kind === 'press') RAP.pressInteract(st, 1);
      else RAP.releaseInteract(st, 1);
      ai++;
    }
    RAP.step(st, dt);
  }
  return { result: st.result || '未结束', reason: st.failReason || '', time: st.time,
           x: st.car ? st.car.x : null, presses: st.pumpPress };
}

const FRAMES = { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]] };
const P1 = Object.assign({}, FRAMES, { pump: [[3, 2]] });
const LV = level();

const show = (tag, r) => console.log('  ' + tag.padEnd(20) + r.result.padEnd(5) +
  (r.reason ? '(' + r.reason + ')' : '').padEnd(9) +
  ' t=' + r.time.toFixed(2).padStart(6) + ' x=' + (r.x === null ? '—' : r.x.toFixed(1)) +
  ' 按了' + r.presses + '次');

console.log('== 1. 必须按吗 ==');
show('不装打气筒', simulate(LV, FRAMES, null, []));
show('装了不按', simulate(LV, P1, null, []));
show('朝右喷', simulate(LV, P1, 0, [{ t: 1.0, kind: 'press' }, { t: 1.8, kind: 'release' }]));
show('朝上喷', simulate(LV, P1, 1, [{ t: 1.0, kind: 'press' }, { t: 1.8, kind: 'release' }]));

console.log('\n== 2. 按下时机的窗口（朝上，按住 0.6s）==');
const times = [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.4];
const wins = [];
times.forEach(t0 => {
  const r = simulate(LV, P1, 1, [{ t: t0, kind: 'press' }, { t: t0 + 0.6, kind: 'release' }]);
  if (r.result === 'win') wins.push([t0, r.time]);
  show('按 @' + t0.toFixed(1) + 's', r);
});
console.log('  窗口内成功 ' + wins.length + ' / ' + times.length +
  (wins.length ? '，时间范围 ' + wins[0][0].toFixed(1) + '~' + wins[wins.length - 1][0].toFixed(1) + 's' : ''));

console.log('\n== 3. 通关时间分布（用来定限时星的阈值）==');
const ts = wins.map(w => w[1]).sort((a, b) => a - b);
if (ts.length) {
  console.log('  最快 ' + ts[0].toFixed(2) + 's  中位 ' + ts[Math.floor(ts.length / 2)].toFixed(2) +
    's  最慢 ' + ts[ts.length - 1].toFixed(2) + 's');
  console.log('  建议阈值 = 最慢 + 1.5s 余量 → ' + (ts[ts.length - 1] + 1.5).toFixed(1) + 's');
}

console.log('\n== 4. 按住多久才够（朝上，@1.0s 开始）==');
[0.1, 0.3, 0.5, 0.7, 0.8].forEach(hold => {
  const r = simulate(LV, P1, 1, [{ t: 1.0, kind: 'press' }, { t: 1.0 + hold, kind: 'release' }]);
  console.log('  hold ' + hold.toFixed(1) + 's → ' + r.result + ' t=' + r.time.toFixed(2));
});

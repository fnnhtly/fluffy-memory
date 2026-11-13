/* 1-2 最终定稿：col 14 + 「只按一下」第三星。
 *
 * 依据（全部实测，见 probe_1_2_goal_distance.js / probe_1_2_lock.js）：
 *   不按打气筒最远滑到 x=13.26 → col 14 及以后不按必 stuck
 *   col 14：不按 fail，按一下 win
 *   按下时机窗口 0.2~1.9s（1.7 秒宽，够宽松）
 *   按住时长 0.1~1.2s 都行（不用卡蓄力）
 *
 * 第三颗星定成 pumpPress ≤ 1（一颗星叫「只按一下」）：
 *   名字和关卡名对上了，而且它奖励的是"少按"ではなく"按得刚刚好"。
 *   连按也能过（★★），只是拿不到三星 —— 这正是参考累计制想要的分层：
 *   一局追求一颗星是正常玩法。
 *
 * 这个脚本最后确认：连按几次仍能通关（否则这颗星变成"必须一局搞定"的惩罚），
 * 以及不按/少按/多按的 pumpPress 计数准确。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');

const BASE = L[1];
const GOAL = 14;

function buildLevel(challenge) {
  const lv = JSON.parse(JSON.stringify(BASE));
  const g = lv.mapRows.map(r => r.split(''));
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] === 'E') g[r][c] = '.';
  g[7][GOAL] = 'E';
  lv.mapRows = g.map(r => r.join(''));
  lv.goal = { col: GOAL, row: 7 };
  lv.boxes = [{ col: 8, row: 6 }];
  lv.challenge = challenge || { type: 'pumpPress', max: 1 };
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
  while (st.phase === 'run' && st.time < (maxT || 25)) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      if (acts[ai].kind === 'press') RAP.pressInteract(st, 1);
      else RAP.releaseInteract(st, 1);
      ai++;
    }
    RAP.step(st, dt);
  }
  return st;
}

const FRAMES = { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]] };
const P1 = Object.assign({}, FRAMES, { pump: [[3, 2]] });
const lv = buildLevel({ type: 'pumpPress', max: 1 });

const one = [{ t: 0.8, kind: 'press' }, { t: 1.5, kind: 'release' }];
const two = one.concat([{ t: 1.9, kind: 'press' }, { t: 2.5, kind: 'release' }]);
const three = two.concat([{ t: 2.9, kind: 'press' }, { t: 3.5, kind: 'release' }]);

console.log('== 1-2 定稿：终点 col ' + GOAL + '，第三星「只按一下」（pumpPress ≤ 1）==\n');
const ROWS = [
  ['不装打气筒', FRAMES, null, []],
  ['装了不按', P1, null, []],
  ['按一下', P1, 0, one],
  ['按两下', P1, 0, two],
  ['按三下', P1, 0, three],
  ['朝上按一下', P1, 1, one],
];
ROWS.forEach(([tag, spec, dir, ps]) => {
  const st = simulate(lv, spec, dir, ps);
  console.log('  ' + tag.padEnd(12) + (st.result || '未结束').padEnd(5) +
    ' t=' + st.time.toFixed(2).padStart(5) +
    ' pumpPress=' + st.pumpPress +
    ' ★' + st.stars + ' ' + JSON.stringify(st.starGoals) +
    ' 木箱 ' + st.boxesGot + '/' + st.boxes.length);
});

console.log('\n== 这颗星是可达的吗 ==');
const w = simulate(lv, P1, 0, one);
console.log('  按一下拿满三星：' + (w.stars === 3 ? '是 ✓' : '否 ✗ (' + w.stars + ' 星)'));
const tw = simulate(lv, P1, 0, two);
console.log('  按两下仍能通关（只是掉一颗星）：' + (tw.result === 'win' ? '是 ✓' : '否 ✗'));
console.log('  按两下确实被判为不满足第三星：' +
  (tw.starGoals && tw.starGoals.challenge === false ? '是 ✓' : '否 ✗'));

console.log('\n== 通关时间（备用：若以后想换限时星）==');
const times = [];
for (let t0 = 0.4; t0 <= 2.2; t0 += 0.2) {
  for (let hold = 0.4; hold <= 1.0; hold += 0.2) {
    const st = simulate(lv, P1, 0, [{ t: t0, kind: 'press' }, { t: t0 + hold, kind: 'release' }]);
    if (st.result === 'win') times.push(st.time);
  }
}
times.sort((a, b) => a - b);
console.log('  n=' + times.length + '  最快 ' + times[0].toFixed(2) +
  '  中位 ' + times[Math.floor(times.length / 2)].toFixed(2) +
  '  最慢 ' + times[times.length - 1].toFixed(2));

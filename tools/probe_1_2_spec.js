/* 1-2 定稿参数标定：平地 + 目标 col 12 + 一次朝右喷气。
 *
 * 设计意图（写进关卡前必须先量准）：
 *   这一关要教的是"打气筒是唯一的推进力，而且一次就够"。
 *   所以地形必须是**平地**——车不会自己滑，不按就永远停在原地。
 *   这样"必须按"是结构性的（不是数值卡出来的），
 *   而"按的时机"完全自由（实测 15 个时间点里 14 个成功），
 *   玩家不会把注意力花在卡帧上，而是花在"哦，这一下把我推出去了"。
 *
 * 第三颗星定成「只按一下」：新手拿到打气筒的本能是连按，
 * 而这一关要告诉他的恰恰是"一下就到"。
 * 连按也能通关（★★），只是拿不到三星 —— 这正是参考的累计制想要的分层。
 *
 * 这个脚本输出：通关时间、按住时长窗口、按几下才到、超喷会不会出事。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');

const COLS = 40, ROWS = 14;
const BASE = L[1];

function makeLevel(goalCol, boxCol) {
  const g = Array.from({ length: ROWS }, () => new Array(COLS).fill('.'));
  const put = (r, c, ch) => { if (r >= 0 && r < ROWS && c >= 0 && c < COLS) g[r][c] = ch; };
  put(4, 1, 'S');
  for (let c = 0; c < COLS; c++) for (let r = 8; r < ROWS; r++) put(r, c, '#');
  put(4, goalCol, 'E');
  if (boxCol !== undefined) put(7, boxCol, 'B');
  const lv = JSON.parse(JSON.stringify(BASE));
  lv.mapRows = g.map(r => r.join(''));
  lv.goal = { col: goalCol, row: 4 };
  lv.materials = [{ surfaceRow: 8, cols: [0, COLS - 1], type: 'mud' }];
  lv.partsBox = { wood_frame: 3, wood_wheel: 2, pump: 4, pig: 1 };
  lv.boxes = boxCol === undefined ? [] : [{ col: boxCol, row: 7 }];
  lv.challenge = { type: 'none' };
  return lv;
}

function simulate(lv, spec, presses, maxT) {
  RAP.resetParams({});
  const b = RAP.newBuild();
  RAP.applySpec(lv, b, spec);
  const st = RAP.createRun(lv, b);
  st.car.parts.filter(p => p.def === RAP.PARTS.pump).forEach(p => { p.dir = 0; });  // 全部朝右
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

const GOAL = 12, BOX = 7;
const lv = makeLevel(GOAL, BOX);

const one = [{ t: 1.0, kind: 'press' }, { t: 1.8, kind: 'release' }];

console.log('== 目标 col ' + GOAL + '，木箱 col ' + BOX + ' ==');
{
  const st = simulate(lv, P1, one);
  console.log('  一次喷气 → ' + (st.result || '未结束') + ' t=' + st.time.toFixed(2) +
    ' 按了 ' + st.pumpPress + ' 次  木箱 ' + st.boxesGot + '/' + st.boxes.length +
    '  ★' + st.stars + ' ' + JSON.stringify(st.starGoals || {}));
}

console.log('\n== 不按 / 连按 ==');
[[], one,
 [].concat([{ t: 0.6, kind: 'press' }, { t: 1.2, kind: 'release' }],
           [{ t: 1.5, kind: 'press' }, { t: 2.1, kind: 'release' }]),
 [].concat([{ t: 0.6, kind: 'press' }, { t: 1.2, kind: 'release' }],
           [{ t: 1.5, kind: 'press' }, { t: 2.1, kind: 'release' }],
           [{ t: 2.5, kind: 'press' }, { t: 3.1, kind: 'release' }])
].forEach((ps, i) => {
  const st = simulate(lv, P1, ps);
  console.log('  按 ' + st.pumpPress + ' 次 → ' + (st.result || '未结束') + ' t=' + st.time.toFixed(2) +
    '  木箱 ' + st.boxesGot + '  ★' + st.stars);
});

console.log('\n== 按住时长（@1.0s 按下）==');
for (let h = 0.2; h <= 1.2; h += 0.1) {
  const st = simulate(lv, P1, [{ t: 1.0, kind: 'press' }, { t: 1.0 + h, kind: 'release' }]);
  console.log('  ' + h.toFixed(1) + 's → ' + (st.result || '未结束') +
    '  x=' + (st.car ? st.car.x.toFixed(1) : '—') + ' t=' + st.time.toFixed(2));
}

console.log('\n== 按下时机（按住 0.8s）==');
{
  let ok = 0, tot = 0;
  for (let t0 = 0.2; t0 <= 4.0; t0 += 0.2) {
    tot++;
    const st = simulate(lv, P1, [{ t: t0, kind: 'press' }, { t: t0 + 0.8, kind: 'release' }]);
    if (st.result === 'win') ok++;
  }
  console.log('  ' + ok + '/' + tot + ' 成功');
}

console.log('\n== 通关时间分布（定「限时」备用）==');
{
  const times = [];
  for (let h = 0.6; h <= 1.0; h += 0.1) {
    for (let t0 = 0.4; t0 <= 3.0; t0 += 0.2) {
      const st = simulate(lv, P1, [{ t: t0, kind: 'press' }, { t: t0 + h, kind: 'release' }]);
      if (st.result === 'win') times.push(st.time);
    }
  }
  times.sort((a, b) => a - b);
  if (times.length) {
    console.log('  n=' + times.length + '  最快 ' + times[0].toFixed(2) +
      '  中位 ' + times[Math.floor(times.length / 2)].toFixed(2) +
      '  最慢 ' + times[times.length - 1].toFixed(2));
  }
}

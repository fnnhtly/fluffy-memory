/* 探针：六关里"最疼的那一下"到底多疼？
 *
 * 上一份 probe_damage.js 已经量到：六关标准解**一次 impact 都没有**
 * （impact 的门槛是 |vn| > 6），分级触地全是 lvl=1（<2.5）。
 * 那就意味着三样东西在正式游玩里从来没出现过：
 *   · 木框的三段耐久（裂纹 / 破损）—— 渲染层支持，物理层永远不触发
 *   · 撞击演出（慢动作 / 震屏 / 闪白 / 碎片）
 *   · 「不散架」这颗星（永远白送）
 *
 * 这份探针要量出"差多少"，才能决定是"调门槛"还是"加关卡"：
 *   A. 每关标准解的最大法向速度 |vn|（用 Params.collectContacts 收集）
 *   B. 随机造法（故意造得差）能不能撞到 6 —— 也就是这个门槛对玩家是否可达
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');
const levels = L.levels || L;

function runOne(lv, spec, label) {
  RAP.resetParams();
  RAP.Params.collectContacts = [];
  /* 标准解必须走 simulate：它会把 _presses / _drops / _pops 按时间轴执行。
   * 手动 while(step) 会漏掉这些动作，1-2 与 1-6 直接变 fail ——
   * 第一版就是这么错的（量到的 10.08 m/s 其实是"一个失败局"的摔地速度）。 */
  const st = RAP.simulate(lv, spec, { maxTime: 40 });
  let maxVn = 0, impacts = 0, broken = 0;
  const cc = RAP.Params.collectContacts || [];
  for (let k = 0; k < cc.length; k++) if (cc[k] > maxVn) maxVn = cc[k];
  (st.events || []).forEach(e => {
    if (e.indexOf('impact') === 0) impacts++;
    if (e.indexOf('part_broken') === 0) broken++;
  });
  RAP.Params.collectContacts = null;
  console.log('  ' + label.padEnd(22) + (st.result || '?').padEnd(10) +
    ' t=' + st.time.toFixed(2) + 's  最大|vn|=' + maxVn.toFixed(2) +
    '  impact=' + impacts + '  碎框=' + broken +
    '  猪hp=' + (st.pigHP === undefined ? '?' : st.pigHP));
  return { maxVn, impacts, broken, result: st.result };
}

const specOf = {
  '1-1': '1-1', '1-2': '1-2', '1-3': '1-3', '1-4': '1-4i', '1-5': '1-5n', '1-6': '1-6'
};

console.log('===== A. 标准解的最大法向速度 =====');
const std = [];
levels.forEach(lv => std.push(runOne(lv, RAP.SPECS[specOf[lv.levelId]], lv.levelId + ' 标准解')));

console.log('\n===== B. 玩家可能的错误造法，能不能撞到 6 =====');

// 1-1 是最平的一关。故意造三种"烂车"再跑：重车、没轮子、单轮偏置。
const lv0 = levels[0];
const badBuilds = [
  ['空车壳（无轮）', b => { [[4, 1], [4, 2], [4, 3]].forEach(rc => RAP.tryPlace(lv0, b, 'wood_frame', rc[0], rc[1])); }],
  ['重车（5 块框）', b => { [[3, 1], [3, 3], [4, 1], [4, 2], [4, 3]].forEach(rc => RAP.tryPlace(lv0, b, 'wood_frame', rc[0], rc[1]));
    RAP.tryPlace(lv0, b, 'wood_wheel', 5, 2); RAP.tryPlace(lv0, b, 'pig', 4, 2); }],
  ['单轮偏后', b => { [[4, 1], [4, 2], [4, 3]].forEach(rc => RAP.tryPlace(lv0, b, 'wood_frame', rc[0], rc[1]));
    RAP.tryPlace(lv0, b, 'wood_wheel', 5, 3); RAP.tryPlace(lv0, b, 'pig', 4, 2); }]
];
badBuilds.forEach(([label, mk]) => {
  RAP.resetParams();
  RAP.Params.collectContacts = [];
  const b = RAP.newBuild();
  mk(b);
  const st = RAP.createRun(lv0, b);
  let maxVn = 0;
  for (let i = 0; i < 2400 && st.phase === 'run'; i++) {
    RAP.step(st, 1 / 60);
    const cc = RAP.Params.collectContacts;
    for (let k = 0; k < cc.length; k++) if (cc[k] > maxVn) maxVn = cc[k];
    cc.length = 0;
  }
  let impacts = 0, broken = 0;
  (st.events || []).forEach(e => {
    if (e.indexOf('impact') === 0) impacts++;
    if (e.indexOf('part_broken') === 0) broken++;
  });
  RAP.Params.collectContacts = null;
  console.log('  ' + label.padEnd(22) + (st.result || '?').padEnd(10) +
    ' t=' + st.time.toFixed(2) + 's  最大|vn|=' + maxVn.toFixed(2) +
    '  impact=' + impacts + '  碎框=' + broken);
});

console.log('\n===== C. 自由落体：把整辆车抬到不同高度再松手 =====');
[2, 4, 6, 8, 11, 16, 25, 30].forEach(h => {
  RAP.resetParams();
  RAP.Params.collectContacts = [];
  const b = RAP.newBuild();
  RAP.applySpec(lv0, b, RAP.SPECS['1-1']);
  const st = RAP.createRun(lv0, b);
  st.car.y = st.startY + h;
  st.spawnGrace = 0;
  let maxVn = 0;
  for (let i = 0; i < 900 && st.phase === 'run'; i++) {
    RAP.step(st, 1 / 60);
    const cc = RAP.Params.collectContacts;
    for (let k = 0; k < cc.length; k++) if (cc[k] > maxVn) maxVn = cc[k];
    cc.length = 0;
  }
  let impacts = 0, broken = 0;
  (st.events || []).forEach(e => {
    if (e.indexOf('impact') === 0) impacts++;
    if (e.indexOf('part_broken') === 0) broken++;
  });
  RAP.Params.collectContacts = null;
  const fr = (st.car && st.car.parts || []).filter(p => p.def.structure);
  console.log('  抬高 ' + String(h).padStart(2) + ' m → 最大|vn|=' + maxVn.toFixed(2) +
    '  impact=' + impacts + '  碎框=' + broken +
    '  剩框=' + fr.length + '  最低耐久=' + (fr.length ? Math.min.apply(null, fr.map(p => p.hp)) : '-') +
    '  结果=' + (st.result || '仍在跑'));
});

console.log('\n===== 结论 =====');
const best = Math.max.apply(null, std.map(s => s.maxVn));
console.log('  六关标准解最大 |vn| = ' + best.toFixed(2) + '（impact 门槛 6，分级 4 = ' + (best >= 6 ? '达到' : '**差 ' + (6 - best).toFixed(2) + '**') + '）');
console.log('  标准解总计 impact/碎框 = ' + std.reduce((a, s) => a + s.impacts, 0) + ' / ' +
  std.reduce((a, s) => a + s.broken, 0));

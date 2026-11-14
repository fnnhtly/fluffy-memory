/* 探针：玩家"玩错"的时候，撞击/碎裂这条管线到底会不会响？
 *
 * 已知（probe_damage.js）：六关的**标准解一次 impact 都没有**（门槛 |vn| > 6，
 * 实测每关最大法向速度都在 1.3～2.9 之间，分级触地全是 lvl=1）。
 * 所以三样东西在"正确玩法"里从不出现：三段耐久、撞击演出、以及「不散架」这颗星。
 *
 * 但那不等于管线是死的 —— 1-6 有 6 个气球、起飞到 16 米高。如果玩家**把它全扎了**，
 * 车就会从 16 米掉下来。这才是这条管线唯一真实的玩家入口，必须量清楚：
 *   A. 全扎 → 撞击多狠、碎不碎、判负理由是什么
 *   B. 那一刻的演出事件（impact / part_broken / part_loose）有没有按顺序出现
 *   C. 车摔碎之后，结算卡会写什么（玩家读到的"原因"）
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');
const levels = L.levels || L;
const lv6 = levels[5];

function runVariant(label, actions) {
  RAP.resetParams();
  const b = RAP.newBuild();
  RAP.applySpec(lv6, b, RAP.SPECS['1-6']);
  const st = RAP.createRun(lv6, b);
  RAP.applySpecRuntime(st, RAP.SPECS['1-6']);
  const acts = actions.slice().sort((a, b2) => a.t - b2.t);
  let ai = 0, maxVn = 0, peakAlt = 0;
  RAP.Params.collectContacts = [];
  for (let i = 0; i < 2400 && st.phase === 'run'; i++) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      const a = acts[ai++];
      if (a.k === 'pop') RAP.popBalloon(st);
      else if (a.k === 'drop') RAP.dropSandbag(st);
      else if (a.k === 'press') RAP.pressInteract(st, 1);
      else RAP.releaseInteract(st, 1);
    }
    RAP.step(st, 1 / 60);
    const cc = RAP.Params.collectContacts;
    for (let k = 0; k < cc.length; k++) if (cc[k] > maxVn) maxVn = cc[k];
    if (cc) cc.length = 0;
    const alt = st.car ? Math.abs(st.car.y - st.terrain.surfaceY(st.car.x)) : 0;
    if (alt > peakAlt) peakAlt = alt;
  }
  RAP.Params.collectContacts = null;
  const evs = st.events || [];
  const pick = k => evs.filter(e => e.indexOf(k) === 0);
  console.log('\n' + label);
  console.log('  结果 ' + (st.result || '?') + ' @' + st.time.toFixed(2) + 's' +
    '　最高离地 ' + peakAlt.toFixed(2) + ' m　最大|vn| ' + maxVn.toFixed(2));
  console.log('  impact ' + pick('impact').length + ' 次　碎框 ' + pick('part_broken').length +
    ' 个　掉出 ' + pick('part_loose').length + ' 个　猪受伤 ' + pick('pig_hurt').length + ' 次');
  const firstImpact = pick('impact')[0];
  if (firstImpact) console.log('  第一次撞击：' + firstImpact);
  console.log('  碎框记录：' + (pick('part_broken').map(e => e.replace('part_broken part=wood_frame at=', '@')).join(' ') || '（无）'));
  console.log('  判定：' + (pick('part_broken').length ? '**车真的摔散架了**' : '车没散架'));
  if (st.hullBroken) console.log('  hullBroken=true（「不散架」星丢失）');
  if (st.pigEjected) console.log('  pigEjected=true（小猪掉出车外）');
  return { st, maxVn, peakAlt, events: evs };
}

// A. 什么都不做（第 40 轮量过：fail stuck）
runVariant('【A】完全不操作', []);
// B. 只扎不扔（10.08 m/s？之前量到过）
runVariant('【B】全扎（6 个）@7.0s，不扔沙袋', [{ t: 7.0, k: 'pop' }, { t: 7.02, k: 'pop' },
  { t: 7.04, k: 'pop' }, { t: 7.06, k: 'pop' }, { t: 7.09, k: 'pop' }, { t: 7.11, k: 'pop' }]);
// C. 标准解（扔 3 沙袋 @4.5，扎 1 @8.0）—— 对照组
runVariant('【C】标准解（对照）', [{ t: 4.5, k: 'drop' }, { t: 4.52, k: 'drop' }, { t: 4.54, k: 'drop' },
  { t: 8.0, k: 'pop' }]);
// D. 扔 3 沙袋后把 6 个气球全扎（"飞得高、然后撒手"）
runVariant('【D】扔 3 沙袋 @4.5，再把 6 个气球全扎 @8.0', [{ t: 4.5, k: 'drop' }, { t: 4.52, k: 'drop' },
  { t: 4.54, k: 'drop' }, { t: 8.0, k: 'pop' }, { t: 8.02, k: 'pop' }, { t: 8.04, k: 'pop' },
  { t: 8.06, k: 'pop' }, { t: 8.09, k: 'pop' }, { t: 8.11, k: 'pop' }]);
// E. 在最高点（~9.5s）全扎
runVariant('【E】扔 3 沙袋 @4.5，在最高点 @9.5 全扎', [{ t: 4.5, k: 'drop' }, { t: 4.52, k: 'drop' },
  { t: 4.54, k: 'drop' }, { t: 9.5, k: 'pop' }, { t: 9.52, k: 'pop' }, { t: 9.54, k: 'pop' },
  { t: 9.56, k: 'pop' }, { t: 9.59, k: 'pop' }, { t: 9.61, k: 'pop' }]);

console.log('\n===== 汇总 =====');
console.log('  结论：1-6 的"全扎"是不是一条真实存在、能撞出演出与散架的玩家路径？');

/* 探针：1-6 里"完全不动手"的玩家会怎样？以及必须动手的时刻是第几秒？
 *
 * 这几个数字决定了引导该怎么写：
 *   - 如果不动手也会拖满 60 秒兜底判负，那玩家的体验是"莫名其妙卡住 60 秒"；
 *   - 如果不动手在 8 秒就被 no_progress 判负，那"把手"必须在前几秒教会；
 *   - 关键动作发生在第 4.5 秒（扔沙袋）—— 出发横幅只活到 1.9 秒，中间有 2.6 秒空窗。
 */
const R = require('../prototype/game.js');
const L = require('../prototype/levels.js');
const levels = L.levels || L;
const lv = levels[5];

function run(specKey, extra) {
  const spec = JSON.parse(JSON.stringify(R.SPECS[specKey]));
  if (extra) extra(spec);
  const r = R.simulate(lv, spec, {});
  return r;
}

console.log('=== 1-6 三种玩家 ===');
const none = run('1-6', s => { delete s._drops; delete s._pops; });
console.log('A. 一个沙袋都不扔、一个气球都不扎：' +
  none.result + ' @ ' + (none.time || 0).toFixed(2) + 's  原因=' + (none.failReason || '-'));

const onlyDrop = run('1-6', s => { delete s._pops; });
console.log('B. 扔了 3 个沙袋但没扎气球：' +
  onlyDrop.result + ' @ ' + (onlyDrop.time || 0).toFixed(2) + 's  原因=' + (onlyDrop.failReason || '-'));

const onlyPop = run('1-6', s => { delete s._drops; });
console.log('C. 没扔沙袋但按时扎气球：' +
  onlyPop.result + ' @ ' + (onlyPop.time || 0).toFixed(2) + 's  原因=' + (onlyPop.failReason || '-'));

const std = run('1-6');
console.log('D. 标准解：' + std.result + ' @ ' + std.time.toFixed(2) + 's  ★' + std.stars);

// 记录标准解的高度/净重曲线，找出"什么时候必须扔"
console.log('\n=== 标准解的高度 / 净重 / 距终点 曲线 ===');
const st = R.createRun(lv, (() => {
  const b = R.newBuild(); R.applySpec(lv, b, R.SPECS['1-6']); return b;
})());
const acts = [];
(R.SPECS['1-6']._drops || []).forEach(a => { for (let i = 0; i < (a.n || 1); i++) acts.push({ t: a.t, k: 'drop' }); });
(R.SPECS['1-6']._pops || []).forEach(a => { for (let i = 0; i < (a.n || 1); i++) acts.push({ t: a.t, k: 'pop' }); });
acts.sort((a, b) => a.t - b.t);
let ai = 0;
const rows = [];
for (let i = 0; i < 60 * 20; i++) {
  while (ai < acts.length && acts[ai].t <= st.time) {
    const a = acts[ai++];
    if (a.k === 'drop') R.dropSandbag(st, 1); else R.popBalloon(st, 1);
  }
  R.step(st, 1 / 60);
  if (i % 15 === 0) {
    const w = R.liftInfo ? R.liftInfo(st) : null;
    rows.push({
      t: +st.time.toFixed(2),
      x: +st.car.x.toFixed(2),
      y: +st.car.y.toFixed(2),
      left: +(lv.goal.col - st.car.x).toFixed(2),
      bags: st.car.sandbags === undefined ? '?' : st.car.sandbags,
      bal: st.car.balloons === undefined ? '?' : st.car.balloons,
      net: w ? +w.net.toFixed(2) : '?'
    });
  }
  if (st.result) break;
}
rows.forEach(r => console.log('  t=' + String(r.t).padStart(5) + '  x=' + String(r.x).padStart(6) +
  '  y=' + String(r.y).padStart(6) + '  距终点 ' + String(r.left).padStart(6) +
  '  沙袋 ' + r.bags + '  气球 ' + r.bal + '  净重 ' + r.net));

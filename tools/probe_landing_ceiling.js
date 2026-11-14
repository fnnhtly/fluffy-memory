/* 探针：玩家在**正常玩**的时候，最狠的那一下落地有多狠？
 *
 * 已知（probe_impact_reach.js）：
 *   · 六关标准解一次 impact 都没有，最大 |vn| 1.3～2.9
 *   · 唯一的真实入口是 1-6「把 6 个气球全扎了」→ 从 12.6 米掉下来 → 11.6 m/s → 车散架
 *
 * 问题是：`damageCar` 的门槛写死在 6 m/s。对 1-6 的特技来说绰绰有余，
 * 对"开车冲下大下坡、车头砸在地上"这种**普通失误**来说又太高了。
 * 如果普通失误永远够不到 6，那三段耐久、裂纹、破损、「不散架」这颗星，
 * 对玩家来说就是"从来没发生过"——做等于没做。
 *
 * 这份探针量三条，用来决定门槛该是多少：
 *   A. 标准解（带全部按键动作）的最大 |vn|
 *   B. 标准解**不做任何按键动作**（一路滑下去，该砸就砸）的最大 |vn|
 *   C. 故意加速冲进大落差（松刹车、全速）的最大 |vn|
 * 门槛必须满足：> A/B/C 里"正常通关"的最大值（不能误伤），
 * 且 ≤ 玩家失误能达到的值（否则永远不发生）。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');
const levels = L.levels || L;

const SPEC_OF = { '1-1': '1-1', '1-2': '1-2', '1-3': '1-3', '1-4': '1-4i', '1-5': '1-5n', '1-6': '1-6' };

/* 跑一局并把最大法向速度、冲击次数、碎框数收集起来。
 * 必须用 RAP.simulate 或自己复刻它的时间轴 —— 手动 while(step) 会漏掉
 * _presses / _drops / _pops，1-2 和 1-6 会直接变 fail（踩过）。 */
function measure(lv, spec, opts) {
  opts = opts || {};
  RAP.resetParams(opts.params);
  const b = RAP.newBuild();
  RAP.applySpec(lv, b, spec);
  const st = RAP.createRun(lv, b);
  RAP.applySpecRuntime(st, spec);
  const acts = [];
  if (!opts.noActions) {
    ((spec && spec._presses) || []).forEach(a => acts.push({ t: a.t, k: a.k || 'press' }));
    ((spec && spec._drops) || []).forEach(a => {
      for (let i = 0; i < (a.n || 1); i++) acts.push({ t: a.t + i * 0.016, k: 'drop' });
    });
    ((spec && spec._pops) || []).forEach(a => {
      for (let i = 0; i < (a.n || 1); i++) acts.push({ t: a.t + i * 0.016, k: 'pop' });
    });
  }
  acts.sort((a, b2) => a.t - b2.t);
  let ai = 0, maxVn = 0;
  RAP.Params.collectContacts = [];
  const maxT = opts.maxTime || 45;
  for (let i = 0; i < maxT * 60 && st.phase === 'run'; i++) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      const a = acts[ai++];
      if (a.k === 'drop') RAP.dropSandbag(st);
      else if (a.k === 'pop') RAP.popBalloon(st);
      else if (a.k === 'press') RAP.pressInteract(st, 1);
      else RAP.releaseInteract(st, 1);
    }
    RAP.step(st, 1 / 60);
    const cc = RAP.Params.collectContacts;
    for (let k = 0; k < cc.length; k++) if (cc[k] > maxVn) maxVn = cc[k];
    cc.length = 0;
  }
  RAP.Params.collectContacts = null;
  let impacts = 0, broken = 0;
  (st.events || []).forEach(e => {
    if (e.indexOf('impact') === 0) impacts++;
    if (e.indexOf('part_broken') === 0) broken++;
  });
  return { maxVn, impacts, broken, result: st.result, t: st.time, hullBroken: !!st.hullBroken };
}

const rows = [];
console.log('===== A. 标准解（带按键动作）=====');
levels.forEach(lv => {
  const spec = RAP.SPECS[SPEC_OF[lv.levelId]];
  const m = measure(lv, spec);
  rows.push({ lv: lv.levelId, kind: 'A 标准解', m });
  console.log('  ' + lv.levelId + ' ' + (m.result || '?').padEnd(6) +
    ' 最大|vn| ' + m.maxVn.toFixed(2) + '　impact ' + m.impacts + '　碎框 ' + m.broken);
});

console.log('\n===== B. 标准解但玩家一下都不按（该砸就砸）=====');
levels.forEach(lv => {
  const spec = RAP.SPECS[SPEC_OF[lv.levelId]];
  const m = measure(lv, spec, { noActions: true });
  rows.push({ lv: lv.levelId, kind: 'B 不按键', m });
  console.log('  ' + lv.levelId + ' ' + (m.result || '?').padEnd(6) +
    ' 最大|vn| ' + m.maxVn.toFixed(2) + '　impact ' + m.impacts + '　碎框 ' + m.broken);
});

console.log('\n===== C. 把刹车/省电都关掉，全速冲（模拟"乱开"）=====');
levels.forEach(lv => {
  const spec = RAP.SPECS[SPEC_OF[lv.levelId]];
  const m = measure(lv, spec, {
    noActions: true,
    params: { motorAccel: 6.0, brakeGrip: 1.0, rollResist: 0.0 }
  });
  rows.push({ lv: lv.levelId, kind: 'C 全速冲', m });
  console.log('  ' + lv.levelId + ' ' + (m.result || '?').padEnd(6) +
    ' 最大|vn| ' + m.maxVn.toFixed(2) + '　impact ' + m.impacts + '　碎框 ' + m.broken);
});

console.log('\n===== 汇总 =====');
const win = rows.filter(r => r.m.result === 'win');
const winMax = Math.max.apply(null, win.map(r => r.m.maxVn));
console.log('  通关局（' + win.length + ' 局）最大 |vn| = ' + winMax.toFixed(2));
const allMax = Math.max.apply(null, rows.map(r => r.m.maxVn));
console.log('  全部跑法最大 |vn| = ' + allMax.toFixed(2));
console.log('  现门槛 6.00：' + (allMax >= 6 ? '可达（有人能撞到）' : '**任何正常跑法都够不到**'));
console.log('  → 若门槛设为 4.5：通关局余量 ' + (4.5 - winMax).toFixed(2) + ' m/s，' +
  (allMax >= 4.5 ? '失误能撞到' : '**仍然够不到**'));
console.log('  → 若门槛设为 3.5：通关局余量 ' + (3.5 - winMax).toFixed(2) + ' m/s，' +
  (allMax >= 3.5 ? '失误能撞到' : '仍够不到'));

console.log('\n  逐关"最狠落地"（三种跑法取最大）：');
levels.forEach(lv => {
  const mine = rows.filter(r => r.lv === lv.levelId);
  const mx = Math.max.apply(null, mine.map(r => r.m.maxVn));
  console.log('    ' + lv.levelId + '：' + mx.toFixed(2) + ' m/s' +
    '（' + mine.map(r => r.kind.split(' ')[0] + '=' + r.m.maxVn.toFixed(2)).join(' ') + '）');
});

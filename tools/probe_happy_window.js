/* 探针：1-2 吃到木箱那一刻，猪的表情会是什么？
 *
 * 渲染层的 mood 优先级是
 *   dead > dizzy > hurt > scared > happy
 * happy 的判定有两支：吃到木箱 1 秒内，或者这一局已经赢了。
 * 但 happy 排在 scared 后面 —— `gap > 1.2 || sp2 > 9` 一旦成立就是 scared。
 * 所以"吃到木箱"是否看得见，取决于拿到箱子的那一秒**车是不是在空中/很快**。
 *
 * 这里把渲染层那份判定照抄一遍（不改场景，只复算），逐帧打印。
 * 抄写必然有偏差，所以判据只用它有或没有，不用它精确。
 */
const path = require('path');
const R = require(path.join(__dirname, '..', 'prototype', 'game.js'));
const LEVELS = require(path.join(__dirname, '..', 'prototype', 'levels.js'));

function moodOf(st) {
  const car2 = st.car;
  if (!car2) return 'dead';
  const sp2 = Math.hypot(car2.vx, car2.vy);
  const ca2 = Math.cos(car2.a);
  const lowY = car2.y + (car2.hull ? car2.hull.minY : -0.6) * ca2;
  const gap = Math.max(0, lowY - st.terrain.surfaceY(car2.x));
  const now2 = st.time;
  if (!car2.hasPig) return 'dead';
  if ((st.lastImpactAt || -9) > now2 - 0.7) return 'dizzy';
  if (st.pigHP < 3) return 'hurt';
  if (gap > 1.2 || sp2 > 9) return 'scared';
  if ((st.lastBoxAt || -9) > now2 - 1.0) return 'happy';
  if (st.result === 'win') return 'happy';
  return 'normal';
}

function trace(lvIdx, key) {
  const lv = LEVELS[lvIdx];
  const st = R.simulate(lv, R.SPECS[key], { maxTime: 60 });
  /* simulate 是"跑完再看"，拿不到逐帧。要逐帧就得自己 step，但那样
   * _presses 又不会执行 —— 所以这里只在 simulate 之后复算关键帧：
   * lastBoxAt 那一刻以及之后 1 秒。 */
  console.log(`\n=== ${lv.levelId} / ${key} ===`);
  console.log('  result=' + st.result + ' time=' + st.time.toFixed(2) +
    ' lastBoxAt=' + (st.lastBoxAt === undefined ? 'undefined' : st.lastBoxAt.toFixed(2)) +
    ' lastImpactAt=' + (st.lastImpactAt === undefined ? 'undefined' : st.lastImpactAt.toFixed(2)) +
    ' pigHP=' + st.pigHP);
  console.log('  events: ' + st.events.filter(e => /box|impact|pig_hurt|struct_hurt/.test(e)).join(' | '));
  void moodOf;
}

['1-1', '1-2', '1-3', '1-4', '1-5', '1-6'].forEach((id, i) => {
  const key = { '1-1': '1-1', '1-2': '1-2', '1-3': '1-3', '1-4': '1-4i', '1-5': '1-5n', '1-6': '1-6' }[id];
  trace(i, key);
});

/* 逐帧复算 1-2：用 createRun + 手动按打气筒（和 simulate 里 actScript 同一批函数） */
console.log('\n=== 1-2 逐帧复算（手动执行 _presses，再看 mood）===');
{
  const lv = LEVELS[1];
  R.resetParams();
  const build = R.newBuild();
  R.applySpec(lv, build, R.SPECS['1-2']);
  const st = R.createRun(lv, build);
  R.applySpecRuntime(st, R.SPECS['1-2']);
  const acts = [];
  R.SPECS['1-2']._presses.forEach(a => acts.push({ t: a.t, k: a.k }));
  acts.sort((a, b) => a.t - b.t);
  let ai = 0;
  let boxFrame = null;
  const rows = [];
  for (let i = 0; i < 60 * 4; i++) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      if (acts[ai].k === 'release') R.releaseInteract(st, 1); else R.pressInteract(st, 1);
      ai++;
    }
    R.step(st, 1 / 60);
    const m = moodOf(st);
    if (st.lastBoxAt !== undefined && boxFrame === null) {
      boxFrame = i;
      rows.push(`  ★ 第 ${i} 帧吃到箱子 t=${st.time.toFixed(2)} gap=${(function () {
        const car2 = st.car; const lowY = car2.y + (car2.hull ? car2.hull.minY : -0.6) * Math.cos(car2.a);
        return Math.max(0, lowY - st.terrain.surfaceY(car2.x)).toFixed(2);
      })()} sp=${Math.hypot(st.car.vx, st.car.vy).toFixed(2)} mood=${m}`);
    } else if (boxFrame !== null && i - boxFrame <= 62 && (i - boxFrame) % 6 === 0) {
      const car2 = st.car;
      const lowY = car2.y + (car2.hull ? car2.hull.minY : -0.6) * Math.cos(car2.a);
      rows.push(`  +${i - boxFrame} 帧 t=${st.time.toFixed(2)} ` +
        `gap=${Math.max(0, lowY - st.terrain.surfaceY(car2.x)).toFixed(2)} ` +
        `sp=${Math.hypot(car2.vx, car2.vy).toFixed(2)} pigHP=${st.pigHP} mood=${m}`);
    }
    if (st.phase === 'resolved') break;
  }
  rows.forEach(r => console.log(r));
}

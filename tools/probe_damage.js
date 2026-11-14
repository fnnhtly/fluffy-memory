/* 探针：木框的"耐久三段"到底有没有在玩家眼里发生过？
 *
 * 背景：`PARTS.wood_frame` 写着「耐久 3 段：完好→裂纹→破损→碎」，
 * `drawPartShape` 也真的按 hp 画裂纹和破损。但 `damageCar` 是这么写的：
 *
 *     state.car.parts.forEach(p => { if (!p.def.structure) return; p.hp -= dmg; ... })
 *
 * 也就是说**所有木框永远同步掉血**：一次撞击，三块框一起从 3 变 2，
 * 再一次一起从 2 变 1，第三次一起碎。渲染层支持"每块框不同阶段"，
 * 物理层却把它退化成一根全车共享的血条。
 *
 * 这份探针要量两件事：
 *   A. 六关的标准解里，耐久到底有没有掉过（如果一次都没掉，那三段就是死代码）
 *   B. 一次撞击之后，三块框的 hp 是不是完全相同（如果是，说明"局部受损"不存在）
 *   C. 撞击事件（|vn| > 6）在六关里各发生几次 —— 决定"受损反馈"值不值得做
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');
const levels = L.levels || L;

console.log('===== A. 六关标准解的耐久轨迹 =====');
/* 必须走 RAP.simulate，不能自己 step。
 * 第一版直接 while(step) 循环，于是 `_presses` / `_drops` / `_pops` 一个都没执行 ——
 * 1-2 与 1-6 都被判 fail，而那两份数据会误导"撞击次数"的结论。
 * simulate 是 Node 侧唯一"和浏览器同构"的跑法，量基线只能用它。 */
const out = [];
levels.forEach(lv => {
  const specKey = {
    '1-1': '1-1', '1-2': '1-2', '1-3': '1-3',
    '1-4': '1-4i', '1-5': '1-5n', '1-6': '1-6'
  }[lv.levelId];
  const spec = RAP.SPECS[specKey];
  if (!spec) { console.log(lv.levelId + ' 没有标准解 ' + specKey); return; }
  const st = RAP.simulate(lv, spec);
  let minHp = 3, impacts = 0, touches = {};
  // simulate 返回的是跑完的 state；框架零件在 st.car 上（碎掉的已经不在 parts 里，
  // 所以"最低耐久"要另外从事件流里读）
  (st.car && st.car.parts || []).forEach(p => {
    if (p.def.structure && p.hp < minHp) minHp = p.hp;
  });
  (st.events || []).forEach(e => {
    if (e.indexOf('impact') === 0) impacts++;
    if (e.indexOf('part_broken') === 0) {
      const m = e.match(/hp=(-?\d+)/);
      if (m) minHp = Math.min(minHp, parseInt(m[1], 10));
    }
    if (e.indexOf('touch lvl=') === 0) {
      const k = e.split(' ')[1];
      touches[k] = (touches[k] || 0) + 1;
    }
  });
  const rec = { lv: lv.levelId, res: st.result, t: +st.time.toFixed(2), minHp, impacts,
    touches: touches, hullBroken: !!st.hullBroken, events: (st.events || []).length };
  out.push(rec);
  console.log('  ' + lv.levelId + ' ' + (st.result || '?') + ' @' + st.time.toFixed(2) + 's' +
    '　框最低耐久 ' + minHp + '　撞击次数 ' + impacts +
    '　分级触地 ' + JSON.stringify(touches) + '　碎=' + !!st.hullBroken);
});

console.log('\n===== B. 一次撞击之后，各木框 hp 是否相同 =====');
{
  const lv = levels[0];
  const b = RAP.newBuild();
  RAP.applySpec(lv, b, RAP.SPECS['1-1']);
  const st = RAP.createRun(lv, b);
  st.spawnGrace = 0;
  st.car.parts.forEach(p => { if (p.def.structure) p.__key = p.r + ',' + p.c; });
  RAP.damageCar(st, 7);            // 一次 6~8 档的磕碰
  const frames = st.car.parts.filter(p => p.def.structure);
  console.log('  一次 7 m/s 撞击后：' +
    frames.map(p => '(' + p.r + ',' + p.c + ')=hp' + p.hp).join('  '));
  console.log('  所有框 hp 相同？' + (frames.every(p => p.hp === frames[0].hp) ? '**是（全车共享一根血条）**' : '否（局部受损）'));
  RAP.damageCar(st, 7);
  RAP.damageCar(st, 7);
  const fr2 = st.car.parts.filter(p => p.def.structure);
  console.log('  再撞两次后：' + fr2.map(p => '(' + p.r + ',' + p.c + ')=hp' + p.hp).join('  ') +
    '　碎=' + !!st.hullBroken);
}

console.log('\n===== C. 每关有多少次"够疼"的撞击（|vn| > 6）=====');
out.forEach(r => console.log('  ' + r.lv + '：撞击 ' + r.impacts + ' 次' +
  (r.minHp < 3 ? '，框最低耐久掉到 ' + r.minHp : '，框一直满耐久')));

console.log('\n===== D. 结论 =====');
const anyDrop = out.some(r => r.minHp < 3);
console.log('  标准解里耐久掉过吗：' + (anyDrop ? '掉过' : '**一次都没掉**（三段耐久在六关里是死代码）'));
console.log('  有 impact 事件的关卡：' + out.filter(r => r.impacts > 0).map(r => r.lv).join(' ') || '（没有）');

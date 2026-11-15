/* 探针：真实的"撞击速度"是多少？（用引擎的 `touch lvl= v=` 事件，不用 collectContacts）
 *
 * 上一版用 `Params.collectContacts` 记峰值，读到 5.11 —— 那个数**不可信**：
 * collectContacts 在每一个接触帧都把 |vn| 推进去，包括坡面上"轮子正在离开地面"
 * 那种正向速度。它记的是"接触速度"，不是"撞上去的速度"。
 *
 * 引擎真正用来判伤害的是 `vn < -Params.damageMin`（法向速度朝里、且足够大），
 * 而打了 `touch lvl=N v=X` 事件的那些接触（`vn < -0.8`）**恰好是同一批**。
 * 所以直接用 touch 事件的 v 就是撞击速度。
 *
 * 这份探针把每个造法的 touch 事件拉出来，看：
 *   · 标准解的最大撞击速度；
 *   · "粗暴但能赢"的车最大撞击速度；
 *   · 门槛该放哪才能既不误伤标准解、又让粗暴车真的掉耐久。
 */
const R = require('../prototype/game.js');
const levels = require('../prototype/levels.js');
const KEYS = ['1-1', '1-2', '1-3', '1-4i', '1-5m', '1-6'];

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function wheelKey(spec) { return spec.iron_wheel ? 'iron_wheel' : 'wood_wheel'; }

function touchStats(lv, spec, params) {
  const p = Object.assign({ demoTimeLimit: 600 }, params || {});
  const r = R.simulate(lv, spec, { maxTime: 300, params: p });
  const evs = (r.events || []).filter(e => e.indexOf('touch ') === 0);
  let max = 0, lvls = { 1: 0, 2: 0, 3: 0, 4: 0 };
  evs.forEach(e => {
    const m = /lvl=(\d) v=([\d.]+)/.exec(e);
    if (!m) return;
    lvls[+m[1]]++;
    max = Math.max(max, +m[2]);
  });
  return { res: r.result, reason: r.failReason, time: r.time, n: evs.length, max, lvls,
           hurt: (r.events || []).filter(e => e.indexOf('struct_hurt') === 0).length };
}

function variants(key, spec) {
  const out = [['标准解', clone(spec)]];
  const wk = wheelKey(spec);
  if (spec.wood_frame && spec.wood_frame.length >= 2) {
    const v = clone(spec);
    const maxR = Math.max.apply(null, v.wood_frame.map(rc => rc[1]));
    if (maxR < 7) { v.wood_frame.push([4, maxR + 1]); out.push(['多叠一框', v]); }
  }
  {
    const v = clone(spec);
    v[wk] = [[5, Math.min(7, Math.max.apply(null, v.wood_frame.map(rc => rc[1])))]];
    out.push(['单轮抬到顶', v]);
  }
  {
    const v = clone(spec);
    v[wk] = [[5, 1], [5, 2]];
    out.push(['两轮挤前', v]);
  }
  if (!spec.motor && key !== '1-5m') { const v = clone(spec); v.motor = [[3, 1]]; out.push(['加马达', v]); }
  return out;
}

console.log('关卡 | 造法 | 结果 | 撞击数 | 最大撞击 | lvl1/2/3/4');
console.log('-----|------|------|--------|----------|------------');
const rows = [];
levels.forEach((lv, i) => {
  variants(KEYS[i], R.SPECS[KEYS[i]]).forEach(([name, v]) => {
    const s = touchStats(lv, v, { damageMin: 4.5 });
    rows.push({ levelId: lv.levelId, name, ...s });
    const L = s.lvls;
    console.log(`${lv.levelId} | ${name} | ${s.res}/${s.reason || '-'} | ${String(s.n).padStart(6)} | ` +
      `${s.max.toFixed(2).padStart(8)} | ${L[1]}/${L[2]}/${L[3]}/${L[4]}`);
  });
});

const std = rows.filter(r => r.name === '标准解');
const stdMax = Math.max.apply(null, std.map(r => r.max));
console.log(`\n标准解最大撞击：${stdMax.toFixed(2)}`);
const winRough = rows.filter(r => r.name !== '标准解' && r.res === 'win');
console.log(`粗暴但赢：${winRough.length} 个，最大撞击 ${Math.min.apply(null, winRough.map(r => r.max)).toFixed(2)} ~ ` +
  `${Math.max.apply(null, winRough.map(r => r.max)).toFixed(2)}`);

console.log('\n=== 门槛放在各值时：标准解会不会误伤 / 粗暴赢局会不会掉耐久 ===');
[4.5, 4.0, 3.6, 3.4, 3.2, 3.0, 2.8, 2.6].forEach(gate => {
  let stdHurt = 0;
  levels.forEach((lv, i) => { if (touchStats(lv, R.SPECS[KEYS[i]], { damageMin: gate }).hurt > 0) stdHurt++; });
  let hurt = 0;
  winRough.forEach(w => { if (w.max > gate) hurt++; });
  console.log(`  ${gate}: 标准解误伤 ${stdHurt}/6 关，粗暴赢局会掉耐久 ${hurt}/${winRough.length}` +
    (stdHurt === 0 && hurt > 0 ? '　← 可用' : ''));
});

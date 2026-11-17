/* 测试：触地反馈的四级档位，铺在玩家真实够得着的速度区间吗？
 *
 * 这一轮查出的事故：整套触地演出（尘土 3→5→8→10 颗、震屏 0.10→0.22→0.42→0.85、
 * lvl3 起全屏闪 + 碎屑、lvl4 慢动作）原来铺在 0.8 / 2.5 / 4.5 / 6.0 上，
 * 而六关标准解 28 次触地**全部**落在 0.80 ~ 1.70 —— 正常通关的每一趟只有 lvl1。
 * 玩家赢得很干净，也赢得很安静。这不是"没打磨"，是**反馈标尺铺错了区间**。
 *
 * 修法只动 lvl2（2.5 → 1.35），把"真的砸了一下"接上尘土和轻震。
 * lvl3 / lvl4 保持不动，因为它们和 damageMin 同一道门槛：
 * "响得那么一下，就得掉耐久"这条对齐关系不能破坏。
 *
 * 断言清单：
 *   1. 三个档位是 DEFAULTS 里的参数（不是散在代码里的字面量）；
 *   2. 顺序正确：0.8 < lvl2 < lvl3 ≤ lvl4，且 lvl3 == damageMin（对齐）；
 *   3. 六关标准解：0 条 lvl3+、0 次掉耐久（正确打法不被闪屏砸、不误伤）；
 *   4. 六关标准解合计 lvl2 > 0，并且至少 3 关真的有 lvl2（落地有反馈）；
 *   5. 猛车仍能进 lvl4（最重那档不是死档）；
 *   6. 量具自证：把 lvl2 抬到 4.5（高于标准解上界），lvl2 数量必须归零 ——
 *      证明第 4 条量的是档位而不是"总有尘土"。
 */
const G = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');
/* ⚠ 第 72 轮：下标对齐的写法在加第 7 关时会崩
 * （`G.SPECS[KEYS[6]]` = undefined → applySpec 抛异常）。
 * 改成按 levelId 查 —— 关数再变也不用动这里。 */
const KEYS_BY_LEVEL = { '1-1': '1-1', '1-2': '1-2', '1-3': '1-3', '1-4': '1-4i',
                        '1-5': '1-5e', '1-6': '1-6', '1-7': '1-7' };

let pass = 0, fail = 0;
const fails = [];
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✓ ${name}` + (detail ? ` — ${detail}` : '')); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}` + (detail ? ` — ${detail}` : '')); }
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function wheelKey(s) { return s.iron_wheel ? 'iron_wheel' : 'wood_wheel'; }

/* 跑一局，按**引擎当前的档位参数**统计各档条数 */
function tally(lv, spec, params) {
  const p = Object.assign({ demoTimeLimit: 600 }, params || {});
  const r = G.simulate(lv, spec, { maxTime: 300, params: p });
  const c = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let maxV = 0;
  (r.events || []).forEach(e => {
    if (e.indexOf('touch ') !== 0) return;
    const m = /lvl=(\d) v=([\d.]+)/.exec(e);
    if (!m) return;
    c[+m[1]]++;
    maxV = Math.max(maxV, +m[2]);
  });
  return {
    res: r.result, reason: r.failReason, c, maxV,
    hurt: (r.events || []).filter(e => e.indexOf('struct_hurt') === 0).length,
    broke: (r.events || []).filter(e => e.indexOf('part_broken') === 0).length
  };
}

console.log('=== 1. 三个档位是参数 ===');
const D = G.DEFAULTS;
['touchLvl2', 'touchLvl3', 'touchLvl4'].forEach(k => {
  chk(`${k} 在 DEFAULTS 里`, Object.prototype.hasOwnProperty.call(D, k),
    Object.prototype.hasOwnProperty.call(D, k) ? `= ${D[k]}` : '缺失');
});

console.log('\n=== 2. 档位顺序与 damageMin 对齐 ===');
chk('0.8 < touchLvl2', D.touchLvl2 > 0.8, `lvl2 = ${D.touchLvl2}`);
chk('touchLvl2 < touchLvl3', D.touchLvl2 < D.touchLvl3, `${D.touchLvl2} < ${D.touchLvl3}`);
chk('touchLvl3 < touchLvl4', D.touchLvl3 < D.touchLvl4, `${D.touchLvl3} < ${D.touchLvl4}`);
/* 这一条是旧的硬约束，必须保住：撞击"响到 lvl3"的那一刻就得开始掉耐久 */
chk('touchLvl3 === damageMin（响得那么一下就得掉耐久）', D.touchLvl3 === D.damageMin,
  `lvl3 = ${D.touchLvl3}，damageMin = ${D.damageMin}`);

console.log('\n=== 3/4. 六关标准解：不闪屏、不误伤、但落地有反馈 ===');
let s2Total = 0, s3Total = 0, hurtLevels = 0, levelsWithLvl2 = 0;
LEVELS.forEach((lv, i) => {
  const t = tally(lv, G.SPECS[KEYS_BY_LEVEL[lv.levelId]]);
  s2Total += t.c[2];
  s3Total += t.c[3] + t.c[4];
  if (t.hurt > 0 || t.broke > 0) hurtLevels++;
  if (t.c[2] > 0) levelsWithLvl2++;
  chk(`${lv.levelId} 标准解仍然通关`, t.res === 'win', `${t.res}/${t.reason || '-'}`);
  console.log(`      ${lv.levelId} lvl 分布 ${t.c[1]}/${t.c[2]}/${t.c[3]}/${t.c[4]}，` +
    `最大 ${t.maxV.toFixed(2)}，掉耐久 ${t.hurt}、碎 ${t.broke}`);
});
chk('六关标准解 0 条 lvl3+（正确打法不会被闪屏/震屏砸）', s3Total === 0, `${s3Total} 条`);
chk('六关标准解 0 次掉耐久 / 碎框（正确打法不被误伤）', hurtLevels === 0, `${hurtLevels}/6 关受伤`);
chk('六关标准解合计 lvl2 > 0（落地真的响了一下）', s2Total > 0, `${s2Total} 条`);
chk('至少 3 关标准解各有 lvl2（不是全靠一关撑）', levelsWithLvl2 >= 3,
  `${levelsWithLvl2}/6 关有 lvl2`);

console.log('\n=== 5. 最重那档（lvl4）不是死档 ===');
let reached4 = [];
LEVELS.forEach((lv, i) => {
  const base = clone(G.SPECS[KEYS_BY_LEVEL[lv.levelId]]);
  const wk = wheelKey(base);
  const v = clone(base);
  v[wk] = [[5, 1], [3, 1]];                    // 两轮挤底：车厢直接蹭地
  const t = tally(lv, v);
  if (t.c[4] > 0) reached4.push(`${lv.levelId}(${t.c[4]})`);
});
chk('有造法真的撞进 lvl4（慢动作那档活着）', reached4.length > 0,
  reached4.length ? reached4.join('、') : '一次都没进');

console.log('\n=== 6. 量具自证（改档位必须让读数跟着变）===');
{
  /* 把 lvl2 抬到 4.5 —— 高于六关标准解的上界（1.70）。
   * 如果第 4 条量的是"档位"而不是"总归有点尘土"，lvl2 必须变成 0。 */
  let total = 0;
  LEVELS.forEach((lv, i) => { total += tally(lv, G.SPECS[KEYS_BY_LEVEL[lv.levelId]], { touchLvl2: 4.5 }).c[2]; });
  chk('把 touchLvl2 抬到 4.5，标准解 lvl2 归零（说明这条量的是档位）', total === 0, `${total} 条`);
}
{
  /* 反过来：把 lvl2 压到 0.81，几乎每一次触地都该进 lvl2 —— 必须显著变多 */
  let total = 0;
  LEVELS.forEach((lv, i) => { total += tally(lv, G.SPECS[KEYS_BY_LEVEL[lv.levelId]], { touchLvl2: 0.81 }).c[2]; });
  chk('把 touchLvl2 压到 0.81，标准解 lvl2 显著变多', total > s2Total,
    `${total} 条 vs 默认 ${s2Total} 条`);
}
{
  /* 顺序被打乱时引擎不能崩（参数是真机上调得动的） */
  const t = tally(LEVELS[0], G.SPECS['1-1'], { touchLvl4: 2.0, touchLvl3: 1.0, touchLvl2: 3.0 });
  chk('档位参数乱填也不会抛异常', t.res !== undefined, `结果 ${t.res}`);
}

console.log(`\nASSERTS ${pass} / ${pass + fail}`);
if (fail) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }

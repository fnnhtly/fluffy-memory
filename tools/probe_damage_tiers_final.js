/* 量具：伤害三档（1 点 / 2 点 / 散架）的分界，该放在哪？
 *
 * 现行分档是 `vn >= 11 ? 9 : (vn >= 8 ? 2 : 1)`，而实测：
 *   · 六关标准解与所有"粗暴但能赢"的车，撞击速度上限 2.20；
 *   · 最猛的车（全都输）上限 7.90。
 * ⇒ `>= 8` 和 `>= 11` 这两档**永远进不去**：实际只有"1 点"这一档在跑。
 *   木框耐久 3，要掉到 1 需要两次 1 点（中间隔 0.35 秒冷却），
 *   也就是"破损"那一档美术只在极罕见的连续两次硬着陆里出现。
 *
 * 这份量具把猛车每一次真的扣耐久的 |vn| 打出来（含 0.35 秒冷却的效果），
 * 看真实的上界落在哪，才能把 2 点和 9 两档挪到能用进的位置。
 */
const R = require('../prototype/game.js');
const levels = require('../prototype/levels.js');
const KEYS = ['1-1', '1-2', '1-3', '1-4i', '1-5m', '1-6'];

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function wheelKey(s) { return s.iron_wheel ? 'iron_wheel' : 'wood_wheel'; }

/* 一批"尽可能猛"的车：两轮挤底、单轮抬顶+叠框、以及把气球全扎（1-6） */
function violent(levelIndex, spec) {
  const out = [];
  const wk = wheelKey(spec);
  {
    const v = clone(spec); v[wk] = [[5, 1], [3, 1]]; out.push(['两轮挤底', v]);
  }
  {
    const v = clone(spec);
    const maxR = Math.max.apply(null, spec.wood_frame.map(rc => rc[1]));
    if (maxR < 7) v.wood_frame.push([4, maxR + 1]);
    v[wk] = [[5, maxR]];
    out.push(['叠框+单轮抬顶', v]);
  }
  if (levelIndex === 5) {
    /* 1-6 的"全扎"是公开的高危路径：扔 3 袋再扎 6 球直接摔散 */
    const v = clone(spec);
    v._pops = [{ t: 8.0, n: 6 }];
    out.push(['全扎 6 球', v]);
  }
  return out;
}

const DMG = 99;   // 先不扣血，只看撞击速度与时序
const rows = [];
levels.forEach((lv, i) => {
  violent(i, R.SPECS[KEYS[i]]).forEach(([name, v]) => {
    const r = R.simulate(lv, v, { maxTime: 300, params: { demoTimeLimit: 600, damageMin: DMG } });
    const vs = (r.events || []).filter(e => e.indexOf('touch ') === 0)
      .map(e => { const m = /v=([\d.]+)/.exec(e); return m ? +m[1] : 0; })
      .filter(v2 => v2 > 0);
    rows.push({ levelId: lv.levelId, name, res: r.result, reason: r.failReason, time: r.time, vs });
  });
});

const all = [];
rows.forEach(r => { r.vs.forEach(v => all.push(v)); r.vs.forEach(v => { if (v > 2.0) all.push(v); }); });
/* 只看"够得上伤害"的那些（> 2.0）—— 这才是伤害分档要铺的区间 */
const hits = [];
rows.forEach(r => r.vs.forEach(v => { if (v > 2.0) hits.push(v); }));
hits.sort((a, b) => a - b);
const q = p => hits.length ? hits[Math.min(hits.length - 1, Math.floor(hits.length * p))] : 0;

console.log(`猛车 ${rows.length} 辆，触地事件 ${rows.reduce((s, r) => s + r.vs.length, 0)} 次，` +
  `其中 > 2.0 的 ${hits.length} 次`);
if (hits.length) {
  console.log(`  分布：min ${hits[0].toFixed(2)}  p50 ${q(0.5).toFixed(2)}  p75 ${q(0.75).toFixed(2)}  ` +
    `p90 ${q(0.9).toFixed(2)}  max ${q(1).toFixed(2)}`);
} else {
  console.log('  （没有超过 2.0 的触地 —— 伤害档位根本无从谈起）');
}

console.log('\n=== 每辆猛车的撞击序列（> 1.0 的）===');
rows.forEach(r => {
  const big = r.vs.filter(v => v > 1.0).sort((a, b) => b - a);
  console.log(`  ${r.levelId} ${r.name}: ${r.res}/${r.reason || '-'} @ ${(r.time || 0).toFixed(2)}s  ` +
    `[${big.map(v => v.toFixed(1)).join(' ')}]`);
});

console.log('\n=== 候选三档分界 ===');
[2, 2.6, 3.2, 4.0, 4.5, 5.5].forEach(t2 => {
 [5.5, 6.5, 7.9, 9.0].forEach(t3 => {
    if (t3 <= t2) return;
    const n2 = hits.filter(v => v >= t2 && v < t3).length;
    const n3 = hits.filter(v => v >= t3).length;
    console.log(`  1点档 [${t2}, ${t3}) ${n2} 次　2点/散架档 ≥${t3} ${n3} 次`);
  });
});

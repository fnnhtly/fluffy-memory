/* 探针：撞击速度的真实量程 —— 定档位要用数据，不是拍脑袋
 *
 * 已经量清的事实（这一轮花了四份探针才量对，前几份全读错了东西）：
 *   六关标准解 max|撞击| = 1.00 ~ 1.70；
 *   所有"粗暴但能赢"的车 max|撞击| = 1.00 ~ 2.20；
 *   而分级反馈的档位是 0.8 / 2.5 / 4.5 / 6，`damageMin` 是 4.5。
 *
 * 结论：**整套档位对着一个玩家到不了的量程**。lvl2/3/4 的演出（碎屑、震屏、
 * 全屏闪、慢动作）和整套耐久系统（裂纹、裂响、HUD 耐久条），
 * 在正常游玩里一次都不会出现 —— 它们是失败局专属的。
 *
 * 这一份把量程的另一头也量出来：**最猛的车能撞到多少**。
 * 只有知道上界，才能把四段档位均匀铺在真实区间里。
 */
const R = require('../prototype/game.js');
const levels = require('../prototype/levels.js');
const KEYS = ['1-1', '1-2', '1-3', '1-4i', '1-5m', '1-6'];

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function wheelKey(s) { return s.iron_wheel ? 'iron_wheel' : 'wood_wheel'; }

/* 尽可能猛、但仍要能跑起来的造法：把框叠高（重心高 → 砸得狠）、
 * 把轮子错开（少一个轮 → 车厢会磕地）。全都要"能发射"，否则量到的是废局。 */
function violent(key, spec) {
  const out = [];
  const wk = wheelKey(spec);
  const maxR = Math.max.apply(null, spec.wood_frame.map(rc => rc[1]));
  // 叠到 5~7 层（越高越猛）
  [0, 1, 2].forEach(extra => {
    const v = clone(spec);
    const base = spec.wood_frame.slice();
    for (let k = 0; k < extra; k++) {
      const r = Math.max.apply(null, base.map(rc => rc[1]));
      if (r >= 7) break;
      base.push([4, r + 1]);
    }
    v.wood_frame = base;
    v[wk] = [[5, Math.min(7, maxR + extra)]];   // 只剩一个轮，车厢直接蹭地
    out.push(['单轮+叠' + extra, v]);
  });
  // 轮子放在最上面一格（车头朝下砸）
  {
    const v = clone(spec);
    v[wk] = [[5, Math.min(7, maxR)]];
    out.push(['轮在顶端', v]);
  }
  // 两轮挤在最下面一格（整辆车靠轮子悬着）
  {
    const v = clone(spec);
    v[wk] = [[5, 1], [3, 1]];
    out.push(['两轮挤底', v]);
  }
  return out;
}

const rows = [];
levels.forEach((lv, i) => {
  violent(KEYS[i], R.SPECS[KEYS[i]]).forEach(([name, v]) => {
    const r = R.simulate(lv, v, { maxTime: 300, params: { demoTimeLimit: 600, damageMin: 99 } });
    const evs = (r.events || []).filter(e => e.indexOf('touch ') === 0);
    let max = 0;
    const lvls = { 1: 0, 2: 0, 3: 0, 4: 0 };
    evs.forEach(e => {
      const m = /lvl=(\d) v=([\d.]+)/.exec(e);
      if (m) { lvls[+m[1]]++; max = Math.max(max, +m[2]); }
    });
    rows.push({ levelId: lv.levelId, name, res: r.result, reason: r.failReason, time: r.time, max });
  });
});

rows.sort((a, b) => b.max - a.max);
console.log('最猛的车（damageMin 设成 99，只看撞击速度，不让它掉耐久）：');
rows.slice(0, 14).forEach(r => console.log(
  `  ${r.levelId} ${r.name}: ${r.res}/${r.reason || '-'} @ ${(r.time || 0).toFixed(2)}s  max ${r.max.toFixed(2)}`));

const allMax = rows.map(r => r.max).filter(v => v > 0).sort((a, b) => a - b);
const q = p => allMax[Math.min(allMax.length - 1, Math.floor(allMax.length * p))];
console.log(`\n${rows.length} 辆车各自的最大撞击速度分布：`);
console.log(`  min ${allMax[0].toFixed(2)}  p25 ${q(0.25).toFixed(2)}  p50 ${q(0.5).toFixed(2)}  ` +
  `p75 ${q(0.75).toFixed(2)}  p90 ${q(0.9).toFixed(2)}  max ${q(1).toFixed(2)}`);

console.log('\n=== 若按真实量程重排四段档位（0.8 保留为"最轻一下"）===');
console.log('  标准解上界 1.70，最猛车 2.' + String(q(1).toFixed(2)).split('.')[1] + ' —— 可用区间就在这两者之间。');
[2.0, 2.2, 2.4, 2.6].forEach(top => {
  const b2 = 0.8 + (top - 0.8) / 3 * 1, b3 = 0.8 + (top - 0.8) / 3 * 2;
  console.log(`  上界 ${top}: 档位 0.8 / ${b2.toFixed(2)} / ${b3.toFixed(2)} / ${top}`);
});

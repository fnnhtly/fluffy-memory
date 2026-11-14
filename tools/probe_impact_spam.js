/* 探针：`impact` 事件是不是在刷屏？
 *
 * 第 45 轮把 damageMin 从 6 挪到 4.5 之后，同一段代码里 `log(state,'impact …')`
 * 的门槛也一起降了。而渲染层对每一条 `impact` 做的是：
 *     slowmo = 0.35（整局慢放）  shake += 0.85  flash = 1  vignette = 1  spawnDebris()
 *
 * 问题在于：`impact` **没有任何去重**。物理每帧跑 4 个子步，每个子步的每个轮子
 * 都可能满足 `vn < -damageMin` —— 一次硬着陆就能连写 8 条 `impact`，
 * 于是慢动作被反复重置成 0.35 秒、震屏叠到上限、碎屑撒 8 次。
 *
 * 而 `touch lvl=4` 那条有 0.06 秒去重（state.lastTouch4），所以它不刷屏 ——
 * 也就是说玩家会看到"撞击的声音和碎屑只有一次，但慢动作和闪白刷了 8 次"。
 *
 * 这一份要把"原始 impact 条数"和"真正不同的重击次数"分开数：
 *   · 同一次接触里相隔 < 0.15 秒的 impact 算**同一次重击**；
 *   · 慢放的累计时长按"重击次数 × 0.35"算（这才是玩家的体感）。
 *
 * 同时它也是六关标准解、随机造法的对照 —— 标准解必须一次都不重击。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');
const levels = L.levels || L;
const SPEC_OF = { '1-1': '1-1', '1-2': '1-2', '1-3': '1-3', '1-4': '1-4i', '1-5': '1-5n', '1-6': '1-6' };
const SLOWMO_PER_HIT = 0.35;
const SAME_HIT_GAP = 0.15;      // 相隔小于这个秒数算同一次重击

// ---- 量具自检：合并算法必须能合、也必须能不合并 ----
{
  const merge = ts => {
    const out = [];
    ts.slice().sort((a, b) => a - b).forEach(t => {
      if (!out.length || t - out[out.length - 1] > SAME_HIT_GAP) out.push(t);
    });
    return out;
  };
  const self = [
    ['同帧 4 条合成 1 次', merge([3.00, 3.00, 3.01, 3.02]).length === 1],
    ['隔 0.5 秒的两下算 2 次', merge([3.0, 3.5]).length === 2],
    ['空输入给 0', merge([]).length === 0]
  ];
  const bad = self.filter(s => !s[1]).map(s => s[0]);
  console.log('量具自检：' + (bad.length ? '✗ ' + bad.join('；') : '✓ 3/3'));
}

let seed = 424242;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pickOne = arr => arr[Math.floor(rand() * arr.length)];

/* 统一的运行器：三类动作都要真的走引擎的公开入口
 * （上一版漏了 press/release，于是 1-2 的标准解被当成"什么都不按"跑成了 fail ——
 * 探针自己把标准解跑错，然后报"标准解被慢动作打断 6 次"。量具第一件事是不许撒谎。） */
function runActions(lv, b, acts) {
  RAP.resetParams();
  const st = RAP.createRun(lv, b);
  acts = (acts || []).slice().sort((x, y) => x.t - y.t);
  let ai = 0, lastLen = 0;
  const impactTs = [];
  for (let i = 0; i < 30 * 60 && st.phase === 'run'; i++) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      const a = acts[ai++];
      const n = a.n || 1;
      for (let k = 0; k < n; k++) {
        if (a.k === 'drop') RAP.dropSandbag(st);
        else if (a.k === 'pop') RAP.popBalloon(st);
        else if (a.k === 'press') RAP.pressInteract(st, 1);
        else if (a.k === 'release') RAP.releaseInteract(st, 1);
      }
    }
    RAP.step(st, 1 / 60);
    // 时间必须在**发生的那一步**记下来（跑完再扫会把每次撞击都标成最后一秒）
    const evs = st.events || [];
    for (let e = lastLen; e < evs.length; e++) {
      if (evs[e].indexOf('impact') === 0) impactTs.push(+st.time.toFixed(3));
    }
    lastLen = evs.length;
  }
  const evs = st.events || [];
  const merged = [];
  impactTs.slice().sort((a, b2) => a - b2).forEach(t => {
    if (!merged.length || t - merged[merged.length - 1] > SAME_HIT_GAP) merged.push(t);
  });
  return {
    result: st.result, t: +st.time.toFixed(2),
    raw: impactTs.length, hits: merged.length, hitTs: merged,
    lvl3: evs.filter(e => /^touch lvl=3/.test(e)).length,
    lvl4: evs.filter(e => /^touch lvl=4/.test(e)).length
  };
}

function specActs(spec) {
  const acts = [];
  ((spec._presses) || []).forEach(a => acts.push({ t: a.t, k: a.k || 'press' }));
  ((spec._drops) || []).forEach(a => acts.push({ t: a.t, k: 'drop', n: a.n || 1 }));
  ((spec._pops) || []).forEach(a => acts.push({ t: a.t, k: 'pop', n: a.n || 1 }));
  return acts;
}
function specBuild(lv, spec) {
  const b = RAP.newBuild();
  RAP.applySpec(lv, b, spec);
  return b;
}

console.log('\n===== 1) 六关标准解：必须 0 次重击（正式解法不许被打断）=====');
let stdRaw = 0, stdHits = 0;
levels.forEach(lv => {
  const spec = RAP.SPECS[SPEC_OF[lv.levelId]];
  const r = runActions(lv, specBuild(lv, spec), specActs(spec));
  stdRaw += r.raw; stdHits += r.hits;
  console.log('  ' + lv.levelId + '　' + (r.result || '?') + ' @' + r.t + 's' +
    '　impact 原始 ' + r.raw + ' → 重击 ' + r.hits +
    '　touch lvl3 ' + r.lvl3 + ' lvl4 ' + r.lvl4);
});
console.log('  结论：' + (stdHits === 0 && stdRaw === 0
  ? '✓ 标准解全程 0 条 impact —— 正式解法完全不受影响'
  : '⚠ 标准解出现 impact（原始 ' + stdRaw + ' / 重击 ' + stdHits + '）'));

console.log('\n===== 2) 随机造法：局数与重击次数 =====');
const all = [];
levels.forEach(lv => {
  for (let t = 0; t < 30; t++) {
    const box = lv.partsBox || {};
    const b = RAP.newBuild();
    Object.keys(box).forEach(p => {
      const cnt = box[p];
      if (p === 'pig') {
        const frames = Object.keys(b.cells).filter(k => b.cells[k].part === 'wood_frame');
        if (!frames.length) return;
        const k = pickOne(frames);
        RAP.tryPlace(lv, b, p, +k.split(',')[0], +k.split(',')[1]);
        return;
      }
      for (let i = 0; i < cnt; i++) {
        for (let k = 0; k < 40; k++) {
          const r2 = Math.floor(rand() * 8), c = Math.floor(rand() * 6);
          if (RAP.tryPlace(lv, b, p, r2, c).ok) break;
        }
      }
    });
    if (!RAP.canLaunch(b).ok) continue;
    const r = runActions(lv, b, []);
    all.push({ lv: lv.levelId, ...r });
  }
});

const wins = all.filter(r => r.result === 'win');
const loses = all.filter(r => r.result !== 'win');
const fmt = arr => {
  if (!arr.length) return '（无）';
  const hits = arr.map(r => r.hits), raws = arr.map(r => r.raw);
  const avgH = hits.reduce((a, b2) => a + b2, 0) / hits.length;
  const avgR = raws.reduce((a, b2) => a + b2, 0) / raws.length;
  return 'n=' + arr.length + '　重击均值 ' + avgH.toFixed(1) + '（原始 ' + avgR.toFixed(1) +
    '）　重击最高 ' + Math.max.apply(null, hits) + '（原始最高 ' + Math.max.apply(null, raws) + '）';
};
console.log('  通关局：' + fmt(wins));
console.log('  失败局：' + fmt(loses));

console.log('\n===== 3) 刷屏倍数：一条重击被写成了多少条事件 =====');
{
  const ratios = all.filter(r => r.hits > 0).map(r => r.raw / r.hits);
  ratios.sort((a, b2) => a - b2);
  if (!ratios.length) console.log('  （没有重击，无法量）');
  else {
    const med = ratios[Math.floor(ratios.length / 2)];
    console.log('  有重击的 ' + ratios.length + ' 局里，原始/重击 中位 ' + med.toFixed(2) +
      '　最高 ' + ratios[ratios.length - 1].toFixed(2) + ' 倍');
    console.log('  判读：' + (ratios[ratios.length - 1] > 2
      ? '⚠ 同一次重击被写成最多 ' + ratios[ratios.length - 1].toFixed(1) +
        ' 条 impact —— 慢动作会被反复重置，震屏和碎屑也会叠'
      : '去重效果可接受（≤2 倍）'));
  }
}

console.log('\n===== 4) 慢放预算：通关的局里有多少时间是慢动作 =====');
{
  const rs = wins.map(r => (r.t > 0 ? (r.hits * SLOWMO_PER_HIT) / r.t : 0)).sort((a, b2) => a - b2);
  if (!rs.length) console.log('  （没有通关局）');
  else {
    const med = rs[Math.floor(rs.length / 2)], max = rs[rs.length - 1];
    console.log('  通关局"慢放时间 / 行驶时间"：中位 ' + (100 * med).toFixed(1) +
      '%　最高 ' + (100 * max).toFixed(1) + '%');
    console.log('  判读：' + (max > 0.25
      ? '⚠ 有局超过 25% 的时间在慢放 —— 手感会被拖成"一直在慢动作"'
      : '最高不超过 25%，慢放还只是偶尔的重击演出'));
  }
  // 原始条数口径下的同一指标（对照用，说明刷屏真的会把人拖慢）
  const rsRaw = wins.map(r => (r.t > 0 ? (r.raw * SLOWMO_PER_HIT) / r.t : 0)).sort((a, b2) => a - b2);
  if (rsRaw.length) {
    console.log('  按**原始条数**算：最高 ' + (100 * rsRaw[rsRaw.length - 1]).toFixed(1) +
      '%（如果不去重，这就是玩家实际感受到的拖慢）');
  }
}

console.log('\n===== 5) 重击发生在哪些时刻（是否集中在落地/终点）=====');
const withHits = all.filter(r => r.hits > 0).slice(0, 6);
withHits.forEach(r => {
  console.log('  ' + r.lv + '　' + r.result + ' @' + r.t + 's　重击 ' + r.hits +
    ' 次：' + r.hitTs.slice(0, 8).map(t => t.toFixed(2)).join(' ') +
    (r.hitTs.length > 8 ? ' …' : ''));
});
if (!withHits.length) console.log('  （整批随机造法里一次重击都没发生）');

/* 探针：把 impact 门槛从 6 降到 4.5 之后，伤害分档到底落进哪一档？
 *
 * 背景（两份探针已经量过）：
 *   · 六关标准解的 max|vn| = 1.27~2.93 → 门槛 6 时**一次伤害都没有**
 *   · 唯一能撞到 6 的两条路径全是失败轨迹：1-2 不按打气筒（10.08）、
 *     1-6 早扎光 6 个气球（11.61）
 * 也就是说：渲染层支持的「完好 → 裂纹 → 破损 → 碎」四段，
 * 玩家只能看到**碎**（≥11 直接散架）和**破损**，中间那段「裂纹」永远跳过去。
 *
 * 4.5 的依据：赢的局最高 1.91，所有跑法（含失败）非撞击轨迹最高 2.93，
 * 4.5 留了 1.57 m/s 余量；而 4.5 m/s ≈ 1 米落差，1-2 那种地形就有。
 *
 * 这份探针要回答：降门槛后，**哪些轨迹第一次出现了 hp=2（裂纹）**。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');
const levels = L.levels || L;
const SPEC_OF = { '1-1': '1-1', '1-2': '1-2', '1-3': '1-3', '1-4': '1-4i', '1-5': '1-5n', '1-6': '1-6' };

function run(lv, actions, opts) {
  opts = opts || {};
  RAP.resetParams(opts.params);
  const spec = RAP.SPECS[SPEC_OF[lv.levelId]];
  const b = RAP.newBuild();
  RAP.applySpec(lv, b, spec);
  const st = RAP.createRun(lv, b);
  RAP.applySpecRuntime(st, spec);
  const acts = (actions || []).slice().sort((a, b2) => a.t - b2.t);
  let ai = 0;
  const hpTrail = [];
  const total = st.car.parts.filter(p => p.def.structure).length;
  let lastHpSig = '';
  for (let i = 0; i < 2400 && st.phase === 'run'; i++) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      const a = acts[ai++];
      if (a.k === 'drop') for (let k = 0; k < (a.n || 1); k++) RAP.dropSandbag(st);
      else if (a.k === 'pop') for (let k = 0; k < (a.n || 1); k++) RAP.popBalloon(st);
      else if (a.k === 'press') RAP.pressInteract(st, 1);
      else RAP.releaseInteract(st, 1);
    }
    RAP.step(st, 1 / 60);
    const fr = st.car.parts.filter(p => p.def.structure);
    const sig = fr.map(p => p.r + ',' + p.c + '=' + p.hp).join(' ');
    if (sig !== lastHpSig) { hpTrail.push('t=' + st.time.toFixed(2) + ' [' + sig + ']'); lastHpSig = sig; }
  }
  const evs = st.events || [];
  const out = {
    total, result: st.result, t: +st.time.toFixed(2),
    hullBroken: !!st.hullBroken, pigEjected: !!st.pigEjected,
    hits: evs.filter(e => e.indexOf('impact') === 0).length,
    breaks: evs.filter(e => e.indexOf('part_broken') === 0).length,
    loose: evs.filter(e => e.indexOf('part_loose') === 0).length,
    pigHurt: evs.filter(e => e.indexOf('pig_hurt') === 0).length,
    trail: hpTrail
  };
  return out;
}

const cases = [
  ['标准解', []],
  ['不按任何键', null]
];

console.log('===== 每关：标准解 / 不按键 的耐久轨迹（impactMin=4.5）=====');
levels.forEach(lv => {
  ['标准解', '不按键'].forEach(kind => {
    let acts;
    if (kind === '标准解') {
      const spec = RAP.SPECS[SPEC_OF[lv.levelId]];
      acts = [];
      ((spec._presses) || []).forEach(a => acts.push({ t: a.t, k: a.k || 'press' }));
      ((spec._drops) || []).forEach(a => acts.push({ t: a.t, k: 'drop', n: a.n || 1 }));
      ((spec._pops) || []).forEach(a => acts.push({ t: a.t, k: 'pop', n: a.n || 1 }));
    } else acts = [];
    const r = run(lv, acts);
    console.log('  ' + lv.levelId + ' ' + kind + '　' + (r.result || '?') + ' @' + r.t + 's' +
      '　撞击 ' + r.hits + ' 碎框 ' + r.breaks + ' 掉出 ' + r.loose +
      (r.hullBroken ? '  HULL!' : '') + (r.pigEjected ? '  PIG!' : ''));
    r.trail.forEach(t => console.log('      ' + t));
  });
});

console.log('\n===== 1-6 早扎光（唯一能砸到 11+ 的玩家路径）=====');
{
  const r = run(levels[5], [{ t: 8.0, k: 'pop', n: 6 }]);
  console.log('  ' + (r.result || '?') + ' @' + r.t + 's　撞击 ' + r.hits + ' 碎框 ' + r.breaks +
    ' 掉出 ' + r.loose + ' 猪伤 ' + r.pigHurt);
  r.trail.forEach(t => console.log('      ' + t));
}

console.log('\n===== 汇总：分档覆盖率 =====');
/* 轨迹串的格式是 `t=8.57 [4,1=2 4,2=2 4,3=2]`，耐久值跟在 `=` 后面。
 * 第一版这里写的是 /hp2/、/hp1/ —— 那个正则**永远匹配不到**任何东西，
 * 于是它打印「出现过的耐久阶段：（无）」并且给出一句"裂纹不可达"的结论，
 * 而上面明明已经出现过 `[4,1=2 ...]`。量具自己坏掉时不会报错，只会沉默。
 * 现在按 `=N` 真解析，并且先自检：喂三段构造串，必须各判出对的那一档。 */
const tierOf = (trailStr) => {
  const out = new Set();
  (trailStr || []).forEach(t => {
    const m = t.match(/\[([^\]]*)\]/);
    if (!m) return;
    const vals = (m[1].match(/=-?\d+/g) || []).map(s => parseInt(s.slice(1), 10));
    if (!vals.length) { out.add('碎'); return; }
    vals.forEach(v => {
      if (v <= 0) out.add('碎');
      else if (v === 1) out.add('破损');
      else if (v === 2) out.add('裂纹');
    });
  });
  return out;
};
// 量具自检：构造串必须被判成对应的档（否则后面的结论全部无效）
{
  const self = [];
  const probe = ['t=0 [4,1=3]', 't=1 [4,1=2]', 't=2 [4,1=1]', 't=3 []'];
  const got = tierOf(probe);
  self.push(['=2 判成裂纹', got.has('裂纹')]);
  self.push(['=1 判成破损', got.has('破损')]);
  self.push(['[] 判成碎', got.has('碎')]);
  self.push(['=3 不算任何档', !tierOf(['t=0 [4,1=3]']).has('裂纹')]);
  const bad = self.filter(s => !s[1]).map(s => s[0]);
  console.log('  量具自检：' + (bad.length ? '✗ ' + bad.join('；') : '✓ 4/4（=2/=1/=3/[] 都能判对）'));
}

const seen = new Set();
levels.forEach(lv => {
  [0, 1].forEach(mode => {
    let acts;
    if (mode === 0) {
      const spec = RAP.SPECS[SPEC_OF[lv.levelId]];
      acts = [];
      ((spec._presses) || []).forEach(a => acts.push({ t: a.t, k: a.k || 'press' }));
      ((spec._drops) || []).forEach(a => acts.push({ t: a.t, k: 'drop', n: a.n || 1 }));
      ((spec._pops) || []).forEach(a => acts.push({ t: a.t, k: 'pop', n: a.n || 1 }));
    } else acts = [];
    const r = run(lv, acts);
    tierOf(r.trail).forEach(k => seen.add(k));
  });
});
const r16 = run(levels[5], [{ t: 8.0, k: 'pop', n: 6 }]);
tierOf(r16.trail).forEach(k => seen.add(k));
console.log('  出现过的耐久阶段：' + (Array.from(seen).join('、') || '（无）'));
console.log('  「裂纹」（hp=2）是否可达：' + (seen.has('裂纹') ? '是' : '**否**'));
console.log('  「破损」（hp=1）是否可达：' + (seen.has('破损') ? '是' : '**否**'));

/* 探针：伤害门槛该定在哪个速度？
 *
 * 这一轮（45）要解决的问题：木框耐久三段（完好→裂纹→破损→碎）里，
 * 「裂纹」这一段玩家从来没见过。之前两份探针的量法都不够：只看了标准解，
 * 而标准解的 max|vn| 只有 1.27~1.91 —— 那是"官方答案开得很稳"，
 * 不代表玩家自己造的车也这么稳。
 *
 * 上一次随机扫描（probe_damage_winners.js，门槛 6）已经量到：
 * 60 个随机造法 × 6 关里，**通关的 7 局里就有 2 局受过伤**。
 * 说明门槛 6 并不是"只有失败才碰得到"，赢的局也能撞到 6 以上。
 *
 * 所以这一份要把分布量清楚：赢的局和输的局，各自的最大法向速度是多少？
 * 只有当"赢的局的分布"和"门槛"放在同一张表上，门槛才不是拍脑袋定的。
 *
 * 量法：RAP.Params.collectContacts 会把每个接触子步的 |vn| 记下来（两位小数），
 * 每步读一次再清空，只留最大值 —— 这样不会因为数组无限增长而变慢。
 * 注意：resetParams() 会把 collectContacts 一起抹掉，所以必须在 createRun **之后**赋值。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');
const levels = L.levels || L;

let seed = 777001;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pickOne = arr => arr[Math.floor(rand() * arr.length)];
const PER_LEVEL = 60;

function runOne(lv, b) {
  RAP.resetParams();
  RAP.Params.collectContacts = [];
  const st = RAP.createRun(lv, b);
  let maxVn = 0;
  for (let i = 0; i < 30 * 60 && st.phase === 'run'; i++) {
    RAP.step(st, 1 / 60);
    const c = RAP.Params.collectContacts;
    for (let k = 0; k < c.length; k++) if (c[k] > maxVn) maxVn = c[k];
    c.length = 0;
  }
  const frames = (st.car && st.car.parts || []).filter(p => p.def.structure);
  return {
    maxVn: +maxVn.toFixed(2),
    result: st.result || 'running',
    minHp: frames.length ? Math.min.apply(null, frames.map(p => p.hp)) : 0,
    broke: !!st.hullBroken
  };
}

function randBuild(lv) {
  const box = lv.partsBox || {};
  const names = Object.keys(box);
  const b = RAP.newBuild();
  names.forEach(p => {
    const cnt = box[p];
    if (p === 'pig') {
      const frames = Object.keys(b.cells).filter(k => b.cells[k].part === 'wood_frame');
      if (!frames.length) return;
      const k = pickOne(frames);
      RAP.tryPlace(lv, b, 'pig', +k.split(',')[0], +k.split(',')[1]);
      return;
    }
    for (let i = 0; i < cnt; i++) {
      for (let k = 0; k < 40; k++) {
        const r = Math.floor(rand() * 8), c = Math.floor(rand() * 6);
        if (RAP.tryPlace(lv, b, p, r, c).ok) break;
      }
    }
  });
  return b;
}

const wins = [], loses = [];
levels.forEach(lv => {
  const w = [], l = [];
  for (let t = 0; t < PER_LEVEL; t++) {
    const b = randBuild(lv);
    if (!RAP.canLaunch(b).ok) continue;
    const r = runOne(lv, b);
    if (r.result === 'win') w.push(r.maxVn); else l.push(r.maxVn);
  }
  wins.push.apply(wins, w);
  loses.push.apply(loses, l);
  const fmt = a => a.length ? a.slice().sort((x, y) => x - y).map(v => v.toFixed(2)).join(' ') : '（无）';
  console.log(lv.levelId + '　通关 ' + w.length + ' 局，max|vn| = ' + fmt(w));
  console.log('      失败 ' + l.length + ' 局，max|vn| = ' + fmt(l.slice().sort((x, y) => x - y).slice(-6)) + ' …（列最高的 6 个）');
});

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

console.log('\n===== 最关键的一张表：线路 vs 门槛 =====');
console.log('  全程（六关）最高法向速度：' + fmtAll(Math.max.apply(null, wins.concat(loses))));
console.log('  通关局的 max|vn| 分布：中位 ' + pct(wins, 0.5).toFixed(2) +
  '　90% ' + pct(wins, 0.9).toFixed(2) + '　95% ' + pct(wins, 0.95).toFixed(2) +
  '　最高 ' + Math.max.apply(null, wins).toFixed(2) + '（n=' + wins.length + '）');
console.log('  失败局的 max|vn|：最高 ' + Math.max.apply(null, loses).toFixed(2) + '（n=' + loses.length + '）');

function fmtAll(x) { return x.toFixed(2); }

console.log('\n===== 每个候选门槛的代价（有多少通关局会被误伤）=====');
[6.0, 5.5, 5.0, 4.5, 4.0, 3.5].forEach(m => {
  const hit = wins.filter(v => v > m).length;
  const lhit = loses.filter(v => v > m).length;
  console.log('  门槛 ' + m.toFixed(1) + '：通关局受伤 ' + hit + ' / ' + wins.length +
    '（' + (wins.length ? (100 * hit / wins.length).toFixed(1) : '0') + '%）' +
    '　失败局受伤 ' + lhit + ' / ' + loses.length);
});

console.log('\n  判读：标准解（六个官方答案）的 max|vn| 上限是 1.91，');
console.log('  所以任何 ≥ 2.5 的门槛都不会碰掉官方答案 —— 这是底线。');
console.log('  往下的选择取决于"我们想让多少玩家自己的造法受点伤"，那是个设计取舍，不是物理事实。');

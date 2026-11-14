/* 探针：**能通关的造法**，到底会不会受伤？
 *
 * 这条探针要回答一个此前一直没量准的问题：
 * "木框耐久三段、裂纹、破损、散架"这套东西，对一个**正经造出来、能开到终点**的车，
 * 到底会不会发生？
 *
 * 之前量过的三件事：
 *   · 六关标准解 max|vn| = 1.27~2.93（impact 门槛 6 → 一次都不到）
 *   · 40~400 个随机造法里 12%~13% 会碎 —— 但那批车**一局都没赢**
 *   · 1-6 早扎光气球能从 12.6 米掉下来砸到 11.6 m/s —— 也是失败轨迹
 *
 * 也就是说，"会碎"和"能赢"目前是两个不相交的集合。如果真是这样，
 * 那么耐久/裂纹/散架对玩家来说就只是**失败动画**，不是**造车决策**。
 * 反过来，如果有一小部分赢的车受过伤，那说明这套系统是有意义的，
 * 只是触发条件苛刻。
 *
 * 做法：每关随 60 个合法造法（走真正的 tryPlace，遵守零件箱/连接/中空规则），
 * 跑完整局，**只统计通关的那些**。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');
const levels = L.levels || L;

let seed = 20260419;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pickOne = arr => arr[Math.floor(rand() * arr.length)];

const PER_LEVEL = 60;

const rows = [];
levels.forEach(lv => {
  const box = lv.partsBox || {};
  const names = Object.keys(box);
  const stat = { n: 0, win: 0, fail: 0, winDamaged: 0, failDamaged: 0,
                 winBroken: 0, failBroken: 0, winMaxVn: 0, winHpTrail: [], failMaxVn: 0 };
  for (let t = 0; t < PER_LEVEL; t++) {
    const b = RAP.newBuild();
    // 随机撒：每种零件按零件箱数量撒到图上（tryPlace 自己会拒绝非法位置）
    names.forEach(p => {
      const cnt = box[p];
      if (p === 'pig') {
        // 猪必须放进已有的木框里，否则整局根本没开始
        const frames = Object.keys(b.cells).filter(k => b.cells[k].part === 'wood_frame');
        if (!frames.length) return;
        const k = pickOne(frames);
        RAP.tryPlace(lv, b, 'pig', +k.split(',')[0], +k.split(',')[1]);
        return;
      }
      for (let i = 0; i < cnt; i++) {
        for (let k = 0; k < 40; k++) {
          const r = Math.floor(rand() * 8), c = Math.floor(rand() * 6);
          const res = RAP.tryPlace(lv, b, p, r, c);
          if (res.ok) break;
        }
      }
    });
    const chk = RAP.canLaunch(b);
    if (!chk.ok) continue;
    /* 不能用 RAP.simulate：它只接受 spec，会从 spec 重建一辆车 ——
     * 我们这里要跑的恰恰是"随机撒出来的 build"。所以手动复刻它的主循环，
     * 并且**不注入任何按键动作**（玩家一下都不按）。 */
    const st = RAP.createRun(lv, b);
    for (let i = 0; i < 30 * 60 && st.phase === 'run'; i++) RAP.step(st, 1 / 60);
    if (!st) continue;
    stat.n++;
    const hp = (st.car && st.car.parts || []).filter(p => p.def.structure).map(p => p.hp);
    const damaged = (st.events || []).some(e => e.indexOf('part_broken') === 0) ||
                    (st.events || []).some(e => e.indexOf('part_loose') === 0) ||
                    hp.some(v => v < 3);
    if (st.result === 'win') {
      stat.win++;
      if (damaged) { stat.winDamaged++; if (stat.winHpTrail.length < 4) stat.winHpTrail.push(JSON.stringify(b.cells)); }
      if (st.hullBroken) stat.winBroken++;
    } else {
      stat.fail++;
      if (damaged) stat.failDamaged++;
      if (st.hullBroken) stat.failBroken++;
    }
  }
  rows.push({ lv: lv.levelId, stat });
  console.log(lv.levelId + '：合法造法 ' + stat.n + ' 个 → 通关 ' + stat.win + ' / 失败 ' + stat.fail);
  console.log('        通关里受过伤的 ' + stat.winDamaged + ' 个（碎了 ' + stat.winBroken + ' 个）');
  console.log('        失败里受过伤的 ' + stat.failDamaged + ' 个（碎了 ' + stat.failBroken + ' 个）');
  stat.winHpTrail.forEach(x => console.log('        [通关但受伤] ' + x));
});

const T = rows.reduce((a, r) => ({
  win: a.win + r.stat.win, fail: a.fail + r.stat.fail,
  winDamaged: a.winDamaged + r.stat.winDamaged, winBroken: a.winBroken + r.stat.winBroken,
  failDamaged: a.failDamaged + r.stat.failDamaged, failBroken: a.failBroken + r.stat.failBroken
}), { win: 0, fail: 0, winDamaged: 0, winBroken: 0, failDamaged: 0, failBroken: 0 });

console.log('\n===== 汇总 =====');
console.log('  通关局 ' + T.win + ' 个，其中受过伤 ' + T.winDamaged + ' 个（' +
  (T.win ? (100 * T.winDamaged / T.win).toFixed(1) : '0.0') + '%），碎了 ' + T.winBroken + ' 个');
console.log('  失败局 ' + T.fail + ' 个，其中受过伤 ' + T.failDamaged + ' 个（' +
  (T.fail ? (100 * T.failDamaged / T.fail).toFixed(1) : '0.0') + '%），碎了 ' + T.failBroken + ' 个');
console.log('\n  结论：' + (T.winDamaged === 0
  ? '**受伤只发生在注定失败的车上** —— 耐久/裂纹/散架目前是"失败动画"，不是"造车决策"'
  : '受伤也会发生在能通关的车上 —— 这套系统确实参与玩法，只是概率 ' +
    (100 * T.winDamaged / T.win).toFixed(1) + '%'));

/* 探针：`failLabel` 里的 8 种失败原因，哪些**真的到得了**？
 *
 * 这是一条前几轮反复踩到的教训的推广：
 *   · 第 45 轮查出 `damageCar` 里 `vn > 14 ? 2 : 1` 的 2 点档是**死档**
 *     （maxSpeed=12 封顶，30 米自由落体只有 11.97）；
 *   · 第 54 轮查出 `levels/*.json` 的 `timeLimit` 是死字段；
 *   · 第 56 轮查出 9 个没人读的字段。
 * 那些都是"数据写了、代码没走"。失败原因这张表同理：
 * `failLabel` 有 8 条，结算卡会把它们翻译成给玩家的话。
 * 一条永远翻译不出来的文案，等于代码里藏着一句谎话。
 *
 * 判据：每种 failReason 至少要能在**某一种合法造法**下打出来。
 * 造法池 = 六关标准解 + 每关若干单点扰动（缺零件 / 多零件 / 换个轮子）。
 */
const path = require('path');
const R = require(path.join(__dirname, '..', 'prototype', 'game.js'));
const LEVELS = require(path.join(__dirname, '..', 'prototype', 'levels.js'));

const SPEC_FOR = { '1-1': '1-1', '1-2': '1-2', '1-3': '1-3', '1-4': '1-4i', '1-5': '1-5n', '1-6': '1-6' };

/* failLabel 里登记的全部原因（从源码里抓，避免我手抄漏） */
const FAILS = (function () {
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'prototype', 'game.js'), 'utf8');
  const block = /pig_dead[\s\S]*?no_progress[\s\S]*?\}/.exec(src);
  const keys = block ? [...block[0].matchAll(/[A-Za-z_]+:[^,]+/g)].map(m => m[0].split(':')[0]) : [];
  return keys.length ? keys : ['pig_dead', 'pig_lost', 'out_of_bounds', 'flew_away',
    'stuck', 'empty', 'timeout', 'no_progress'];
})();
console.log('failLabel 登记的原因：' + FAILS.join(' '));

const seen = {};          // reason -> 第一个打出它的造法描述
const results = {};       // result -> 次数
let games = 0;

function note(st, tag) {
  games++;
  results[st.result || 'running'] = (results[st.result || 'running'] || 0) + 1;
  if (st.result === 'fail' && st.failReason && !seen[st.failReason]) {
    seen[st.failReason] = tag;
  }
}

/* --- 1) 六关标准解 --- */
LEVELS.forEach(lv => {
  const st = R.simulate(lv, R.SPECS[SPEC_FOR[lv.levelId]], { maxTime: 60 });
  note(st, `${lv.levelId} 标准解`);
});

/* --- 2) 空车（什么都不放）--- */
LEVELS.forEach(lv => {
  const st = R.simulate(lv, {}, { maxTime: 60 });
  note(st, `${lv.levelId} 空车`);
});

/* --- 3) 只放猪、不放轮子（车壳拖地）--- */
LEVELS.forEach(lv => {
  const st = R.simulate(lv, { pig: [[4, 1]] }, { maxTime: 60 });
  note(st, `${lv.levelId} 只有一只猪`);
});

/* --- 4) 挂满气球（会飘走）--- */
LEVELS.forEach(lv => {
  const st = R.simulate(lv, { wood_frame: [[4, 1]], balloon: [[3, 1]], pig: [[4, 1]],
    _stacks: { balloon: 3 } }, { maxTime: 60 });
  note(st, `${lv.levelId} 只挂气球`);
});

/* --- 5) 每关标准解的单点扰动 --- */
const MUT = [
  (s) => { delete s.pig; },                                     // 没猪
  (s) => { delete s.wood_wheel; delete s.iron_wheel; },          // 没轮子
  (s) => { delete s.wood_frame; },                               // 没框
  (s) => { const k = s.wood_frame ? 'wood_frame' : 'iron_frame'; if (s[k]) s[k] = s[k].slice(0, 1); }, // 只剩 1 格框
  (s) => { delete s.motor; },                                    // 没马达
  (s) => { delete s.battery; },                                  // 没电池
  (s) => { delete s.balloon; },                                  // 没气球（1-6）
  (s) => { delete s.sandbag; },                                  // 没沙袋（1-6）
  (s) => { s.pig = [[4, 0]]; },                                   // 猪挪到最左
  (s) => { s.pig = [[3, 3]]; }                                    // 猪挪到最上
];
LEVELS.forEach(lv => {
  MUT.forEach((fn, i) => {
    const base = JSON.parse(JSON.stringify(R.SPECS[SPEC_FOR[lv.levelId]]));
    /* 元数据里的 _stacks / _presses 在改了零件之后可能不成立，统一清掉动作，
     * 否则会读到"按键驱动的失败"而不是"造法导致的失败"。 */
    fn(base);
    delete base._presses; delete base._drops; delete base._pops; delete base._stacks;
    R.Params.damageMin = R.DEFAULTS.damageMin;
    const st = R.simulate(lv, base, { maxTime: 60 });
    note(st, `${lv.levelId} 扰动#${i}`);
  });
});

/* --- 6) 把车抬到天上再放手（砸地 / 飘走）--- */
LEVELS.forEach(lv => {
  [2, 4, 6, 8, 10, 12].forEach(drop => {
    R.resetParams();
    const build = R.newBuild();
    R.applySpec(lv, build, R.SPECS[SPEC_FOR[lv.levelId]]);
    const st = R.createRun(lv, build);
    R.applySpecRuntime(st, R.SPECS[SPEC_FOR[lv.levelId]]);
    st.car.x = Math.min(lv.grid.cols - 3, 20) + 0.5;
    st.car.y = st.terrain.surfaceY(st.car.x) + drop;
    st.car.vx = 0; st.car.vy = 0; st.car.a = 0; st.car.w = 0;
    st.spawnGrace = 0;
    for (let i = 0; i < 60 * 12; i++) {
      R.step(st, 1 / 60);
      if (st.phase === 'resolved') break;
    }
    note(st, `${lv.levelId} 抬高 ${drop} m`);
  });
});

/* --- 7) 极端参数：慢动作车（逼出 no_progress / timeout）--- */
{
  const lv = LEVELS[4];   // 1-5
  const st = R.simulate(lv, { wood_frame: [[4, 1]], wood_wheel: [[5, 1]], pig: [[4, 1]] },
    { maxTime: 200, params: { motorAccel: 0.4 } });
  note(st, '1-5 极慢');
}

console.log('\n=== 结果分布 ===');
Object.keys(results).sort().forEach(k => console.log(`  ${k.padEnd(10)} ${results[k]} 局`));
console.log(`  合计 ${games} 局`);

console.log('\n=== 每种 failReason 有没有被打出来过 ===');
let dead = 0;
FAILS.forEach(f => {
  const hit = seen[f];
  if (!hit) dead++;
  console.log(`  ${hit ? '✓' : '✗'} ${f.padEnd(14)} ${hit ? '首个命中：' + hit : '**没有任何造法打出来过**'}`);
});
console.log(`\n→ 8 种失败原因里，**${dead} 种从未出现**`);

/* ---------------- 深入：pig_dead 到底能不能被踩到 --------------
 *
 * 猪受伤门槛 vn > 10（0.6 s 冷却），三条命。
 * 但同一次撞击里结构伤害先跑：vn ≥ 8 扣 2 点、vn ≥ 11 直接扣 9 点 = 碎。
 * 木框耐久 3 → 两次 2 点就碎（3 → 1 → −1），一次 9 点立刻碎。
 * 所以"第二次 vn > 10 的撞击"几乎必然同时也是第二次 vn ≥ 8 —— 框先碎、猪被弹出、
 * 一局以 pig_lost 结束，`pigHP <= 0 → pig_dead` 这一支就成了死路。
 *
 * 要让它活，只有一条路：让"撞痛猪"和"撞碎框"解耦。
 * 这里是量，不是改 —— 先证明它现在确实到不了。
 */
console.log('\n=== pig_dead 专查：抬高 + 缩小 damageMin = 0（最容易受伤的配置）===');
{
  let reached = 0, tries = 0;
  const traces = [];
  LEVELS.forEach(lv => {
    [4, 5, 6, 7, 8, 9, 10, 11, 12].forEach(drop => {
      R.resetParams();
      R.Params.damageMin = 0;      // 一点撞击就掉耐久（原记录里这是"最容易受伤"的配置）
      const build = R.newBuild();
      R.applySpec(lv, build, R.SPECS[SPEC_FOR[lv.levelId]]);
      const st = R.createRun(lv, build);
      R.applySpecRuntime(st, R.SPECS[SPEC_FOR[lv.levelId]]);
      st.car.x = Math.min(lv.grid.cols - 3, 20) + 0.5;
      st.car.y = st.terrain.surfaceY(st.car.x) + drop;
      st.car.vx = 0; st.car.vy = 0;
      st.spawnGrace = 0;
      for (let i = 0; i < 60 * 14; i++) {
        R.step(st, 1 / 60);
        if (st.phase === 'resolved') break;
      }
      tries++;
      const hurts = st.events.filter(e => e.indexOf('pig_hurt') === 0).length;
      if (st.failReason === 'pig_dead') reached++;
      if (hurts > 0 || st.failReason === 'pig_lost') {
        traces.push(`${lv.levelId} 落差 ${drop} m：pig_hurt×${hurts} pigHP=${st.pigHP} ` +
          `散架=${st.hullBroken} → ${st.failReason || st.result}`);
      }
    });
  });
  traces.slice(0, 14).forEach(t => console.log('  ' + t));
  console.log(`  ${tries} 次尝试，pig_dead 命中 ${reached} 次`);
}

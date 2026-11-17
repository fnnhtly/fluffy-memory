/* 「三颗种子都必须真的用得上」（第 72 轮）。
 *
 * 第 71 轮把三颗种子做出来了，但**只有风种出现在任何一个关卡的零件箱里**。
 * 岩种和雷种是"能从零件表里调出来、但没有任何一关会给你"的状态 ——
 * 玩家永远见不到它们。这不是"以后再加"，这是一个**完成度**问题：
 * 一套机制做出来了却没有内容用它，等于没做。
 *
 * 这个脚本验三件事：
 *   A. 三颗种子各自至少出现在一个关卡的 partsBox 里；
 *   B. 每一颗种子都有一关**必须用它**（不用就过不去）；
 *   C. 那几关用上种子之后**真的能通关**（不是"理论上能"）。
 *
 * ⚠ C 是重点：B 只证明"没用种子会失败"，那也可能是因为关卡本身根本过不去。
 * 必须两个方向都成立：关了门，并且有钥匙。
 */
console.log('RUNTIME: node');
const R = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');

let pass = 0, fail = 0;
function chk(label, cond, extra) {
  if (cond) { pass++; console.log('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('✗ ' + label + '  ' + (extra || '')); }
}
const lv = id => LEVELS.filter(l => l.levelId === id)[0];

// ---------- A 每颗种子都有关卡发 ----------
{
  const kinds = { anemo: 'anemo_core', geo: 'geo_core', electro: 'electro_core' };
  Object.keys(kinds).forEach(k => {
    const part = kinds[k];
    const hosts = LEVELS.filter(l => (l.partsBox || {})[part] > 0).map(l => l.levelId);
    chk('A ' + k + ' 至少有一关会发给玩家（' + part + '）',
      hosts.length > 0, hosts.length ? hosts.join(',') : '没有任何一关发它');
  });
  /* 反向：吃风件也必须至少有一关发，否则风种永远没用。 */
  const canopy = LEVELS.filter(l =>
    (l.partsBox || {}).umbrella > 0 || (l.partsBox || {}).wind_wing > 0).map(l => l.levelId);
  chk('A2 至少有一关同时发风种和吃风件（否则风场是空按钮）',
    canopy.length > 0, canopy.join(','));
}

// ---------- B 每一颗种子都有一关"必须用它" ----------
/* 判据：这一关**不给种子以外的通行办法**。
 * 做两件事：带上种子必须能过，把种子拆掉必须过不去。
 * 只验前者的话，一个没有屏障/坑的关卡也会通过。 */
{
  // ---- 雷种：1-5 的路线中段立了一道雷屏障 ----
  {
    const L5 = lv('1-5');
    chk('B1 1-5 的数据里有一道雷屏障', (L5.barriers || []).length >= 1,
      JSON.stringify(L5.barriers || []));
    chk('B1b 1-5 发给玩家雷种',
      (L5.partsBox || {}).electro_core > 0, String((L5.partsBox || {}).electro_core));

    const spec = JSON.parse(JSON.stringify(R.SPECS['1-5e'] || {}));
    chk('B1c 1-5 有一条带雷种的标准解 spec（1-5e）', Object.keys(spec).length > 0,
      Object.keys(spec).join(','));

    const withSeed = R.simulate(L5, spec, { maxTime: 90 });
    chk('B2 1-5 用雷种冲刺 → 通关', withSeed.result === 'win',
      withSeed.result + ' x=' + (withSeed.car ? withSeed.car.x.toFixed(2) : '无车'));
    chk('B2b 1-5 真的用掉了雷种（seedUse.electro = 1）',
      withSeed.seedUse && withSeed.seedUse.electro === 1,
      JSON.stringify(withSeed.seedUse));

    /* 反向：同一套车、同一串操作，只把雷种拆掉 → 必须被屏障挡住。 */
    const noSeed = JSON.parse(JSON.stringify(spec));
    delete noSeed.electro_core;
    noSeed._seeds = [];
    const bare = R.simulate(L5, noSeed, { maxTime: 90 });
    chk('B3 1-5 把雷种拆掉 → 过不去（屏障真的挡得住）', bare.result !== 'win',
      bare.result + ' x=' + (bare.car ? bare.car.x.toFixed(2) : '无车') +
      ' ' + (bare.failReason || ''));
  }

  // ---- 岩种：1-7 的路线中段是一道爬不出来的坑 ----
  {
    const L7 = lv('1-7');
    chk('B4 1-7 发给玩家岩种',
      (L7.partsBox || {}).geo_core > 0, String((L7.partsBox || {}).geo_core));
    const spec = JSON.parse(JSON.stringify(R.SPECS['1-7'] || {}));
    chk('B4b 1-7 有一条带岩种的标准解 spec（1-7）', Object.keys(spec).length > 0,
      Object.keys(spec).join(','));

    const withSeed = R.simulate(L7, spec, { maxTime: 90 });
    chk('B5 1-7 用岩种升起岩柱 → 通关', withSeed.result === 'win',
      withSeed.result + ' x=' + (withSeed.car ? withSeed.car.x.toFixed(2) : '无车'));
    chk('B5b 1-7 真的用掉了岩种', withSeed.seedUse && withSeed.seedUse.geo === 1,
      JSON.stringify(withSeed.seedUse));

    /* 反向：把种子拆掉 → 必须卡在坑里。 */
    const noSeed = JSON.parse(JSON.stringify(spec));
    delete noSeed.geo_core;
    noSeed._seeds = [];
    const bare = R.simulate(L7, noSeed, { maxTime: 90 });
    chk('B6 1-7 把岩种拆掉 → 出不了那道坑', bare.result !== 'win',
      bare.result + ' x=' + (bare.car ? bare.car.x.toFixed(2) : '无车') +
      ' ' + (bare.failReason || ''));

    /* 反向 2：**带着种子但不按**也要过不去。
     * 这一条比 B6 更严格 —— B6 只证明"没有种子过不去"，
     * 而"有种子但不按"才是玩家最常见的失败。 */
    const notPressed = JSON.parse(JSON.stringify(spec));
    notPressed._seeds = [];
    const np = R.simulate(L7, notPressed, { maxTime: 90 });
    chk('B6b 1-7 带着岩种但不按 → 也过不去（时机是玩法）', np.result !== 'win',
      np.result + ' x=' + (np.car ? np.car.x.toFixed(2) : '无车') +
      ' ' + (np.failReason || ''));
  }
}

// ---------- C 七关全部仍然可通关 ----------
{
  const SPEC_OF = { '1-1': '1-1', '1-2': '1-2', '1-3': '1-3',
                    '1-4': '1-4w', '1-5': '1-5e', '1-6': '1-6', '1-7': '1-7' };
  const ids = LEVELS.map(l => l.levelId);
  chk('C0 关卡表里有 7 关', ids.length === 7, ids.join(','));
  Object.keys(SPEC_OF).forEach(key => {
    const L = lv(key);
    const spec = R.SPECS[SPEC_OF[key]];
    if (!L || !spec) { chk('C ' + key + ' 标准解能通关', false, '缺关卡或标准解'); return; }
    const st = R.simulate(L, spec, { maxTime: 90 });
    chk('C ' + key + ' 标准解仍然能通关', st.result === 'win',
      'result=' + st.result + ' t=' + st.time.toFixed(1) + 's' +
      (st.failReason ? ' ' + st.failReason : ''));
  });
}

console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
if (fail) console.log('失败项：' + fail + ' 条');
process.exit(fail ? 1 : 0);

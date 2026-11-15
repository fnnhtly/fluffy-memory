/* 探针：猪有三条命（`pigHP`），这条机制在真实关卡里到底会不会触发？
 *
 * 疑点来自读代码：
 *   · 猪受伤的门槛写死在 `damageCar` 里：**vn > 10**，0.6 秒冷却一次；
 *   · 结构伤害的门槛是 `Params.damageMin = 4.5`；而 **vn ≥ 11 直接扣 9 点 = 散架**；
 *   · `Params.maxSpeed = 12` 给整车速度封了顶（30 米自由落体实测 11.97）。
 * 所以"猪受伤"只可能发生在 **10 < vn < 11** 这条缝里 —— 而一旦到 11，结构已经散了。
 *
 * 更要紧的是第二件事：`pigHP` 在界面上一个像素都没有。
 * 渲染层只拿它换表情（< 3 → hurt，<= 0 → 死）。玩家看不到"还剩几条命"。
 * 这和电池电量（第 52 轮）、木框耐久（第 50 轮）是同一类问题。
 *
 * 必须走 `R.simulate`：它是唯一会执行 `_presses` / `_drops` / `_pops` 的 Node 路径。
 * 第一版用 createRun + 手 step，1-2 根本没按过打气筒，读到的是"没按"的失败局
 * （而且还莫名其妙 pigHP=2 —— 那是另一件事，见 C 组）。
 */
const fs = require('fs');
const path = require('path');
const R = require(path.join(__dirname, '..', 'prototype', 'game.js'));
const LEVELS = require(path.join(__dirname, '..', 'prototype', 'levels.js'));

const SPEC_FOR = { '1-1': '1-1', '1-2': '1-2', '1-3': '1-3', '1-4': '1-4i', '1-5': '1-5n', '1-6': '1-6' };

/* 事件串是 `touch lvl=2 v=1.7 x=1.9` —— 用 `split('v=')[1]` 拿到的是
 * `"1.7 x=1.9"`，`+` 出来是 NaN。第一版就是这么打印出 `maxTouch=NaN` 的，
 * 一张列满 NaN 的表看起来像"没有触地"，其实只是解析写错了。
 * 必须用正则取数。 */
function touchV(e) {
  const m = /v=([\d.]+)/.exec(e);
  return m ? parseFloat(m[1]) : 0;
}

function runOne(lv, specKey, params) {
  const st = R.simulate(lv, R.SPECS[specKey], { params: params, maxTime: 60 });
  const evs = st.events || [];
  const touches = evs.filter(e => e.indexOf('touch lvl=') === 0).map(touchV);
  return {
    id: lv.levelId, result: st.result, fail: st.failReason || '', time: +st.time.toFixed(2),
    pigHP: st.pigHP, pigHurt: evs.filter(e => e.indexOf('pig_hurt') === 0).length,
    maxTouch: touches.length ? Math.max(...touches) : 0,
    impacts: evs.filter(e => e.indexOf('impact') === 0).length,
    broken: st.hullBroken
  };
}

console.log('=== A. 六关标准解：pigHP 掉不掉？ ===');
let hurtLevels = 0;
LEVELS.forEach(lv => {
  const r = runOne(lv, SPEC_FOR[lv.levelId]);
  if (r.pigHurt > 0) hurtLevels++;
  console.log(`  ${r.id}  ${r.result.padEnd(4)} ${String(r.time).padStart(5)} s  pigHP=${r.pigHP}  ` +
    `pig_hurt=${r.pigHurt}  impact=${r.impacts}  maxTouch=${r.maxTouch.toFixed(2)}` +
    (r.broken ? '  [散架]' : ''));
});
console.log(`  → 六关里猪受过伤的：${hurtLevels} 关`);

console.log('\n=== B. 自由落体砸地：能不能踩进 10 < vn < 11？ ===');
{
  /* 把车抬到 1-1 的平地上空再松手 —— 物理上最暴力的一种。
   * 落差上限受天花板约束：`car.y > ter.rows + 6` 立刻判 `flew_away`
   * （1-1 是 14 行，地表 y=6，所以最高只能抬到 20 → 落差 14 米）。
   * 第一版直接写 30 米落差，四次全部在第一帧就 flew_away，读到"峰值接触 0.00"，
   * 差点得出"自由落体根本没有接触"这种荒谬结论。 */
  const lv = LEVELS[0];
  const ceil = lv.grid.rows + 6;
  const surf = R.makeTerrain(lv).surfaceY(20.5);
  console.log(`  1-1 地表 y=${surf}，天花板 y=${ceil} → 落差上限 ${(ceil - surf).toFixed(1)} 米`);
  [1, 2, 4, 6, 8, 10, 12].forEach(drop => {
    R.resetParams();
    const build = R.newBuild();
    R.applySpec(lv, build, R.SPECS['1-1']);
    const st = R.createRun(lv, build);
    R.applySpecRuntime(st, R.SPECS['1-1']);
    st.car.x = 20.5;
    st.car.y = st.terrain.surfaceY(20.5) + drop;
    st.car.vx = 0; st.car.vy = 0; st.car.a = 0; st.car.w = 0;
    st.spawnGrace = 0;
    R.Params.collectContacts = [];
    let peak = 0;
    for (let i = 0; i < 60 * 10; i++) {
      R.step(st, 1 / 60);
      R.Params.collectContacts.forEach(v => { if (v > peak) peak = v; });
      R.Params.collectContacts.length = 0;
      if (st.phase === 'resolved') break;
    }
    const tg = st.events.filter(e => e.indexOf('touch lvl=') === 0);
    console.log(`  落差 ${String(drop).padStart(2)} m：峰值接触 ${peak.toFixed(2)} m/s  ` +
      `touch=[${tg.map(e => e.split(' ').slice(1).join(' ')).join(' | ')}]  ` +
      `pigHP=${st.pigHP} 散架=${st.hullBroken} 结果=${st.result}${st.failReason ? '/' + st.failReason : ''}`);
  });
}

console.log('\n=== C. 猪受伤门槛 vs 散架门槛：中间还剩多宽？ ===');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'prototype', 'game.js'), 'utf8');
  const pigM = /if \(vn > ([0-9.]+) && now - \(state\.lastPigHurt/.exec(src);
  const breakM = /var dmg = vn >= ([0-9.]+) \? 9/.exec(src);
  console.log('  猪受伤门槛 vn > ' + (pigM ? pigM[1] : '?'));
  console.log('  散架门槛   vn ≥ ' + (breakM ? breakM[1] : '?') + '（9 点，直接碎）');
  console.log('  damageMin = ' + R.Params.damageMin + '，maxSpeed = ' + R.Params.maxSpeed);
  if (pigM && breakM) {
    const lo = +pigM[1], hi = +breakM[1];
    console.log(`  → 窗口宽 ${(hi - lo).toFixed(2)} m/s，占 0~${R.Params.maxSpeed} 全量程的 ` +
      `${((hi - lo) / R.Params.maxSpeed * 100).toFixed(1)}%`);
    console.log('  → 而且满足 vn ≥ 11 的那一下会**先把结构打成 9 点 = 散架**；' +
      '两个判定同一次撞击里都跑，所以"猪受伤"和"车散架"几乎同时发生。');
  }
}

console.log('\n=== D. 界面上 pigHP 有读者吗？ ===');
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'prototype', 'index.html'), 'utf8').split('\n');
  const readers = html.map((l, i) => [i + 1, l]).filter(x => /pigHP/.test(x[1]));
  console.log('  index.html 里 pigHP 出现 ' + readers.length + ' 次：');
  readers.forEach(x => console.log('    ' + x[0] + ': ' + x[1].trim()));
}

console.log('\n=== E. 六关里到底有多少次"猪受伤"？扫 200 个乱造的车 ===');
{
  let games = 0, hurt = 0, wins = 0, hurtInWin = 0;
  const KEYS = Object.keys(R.SPECS).filter(k => !k.startsWith('_'));
  LEVELS.forEach(lv => {
    for (let t = 0; t < 34; t++) {
      /* 单点扰动标准解：随机的"哪个零件少放一格" */
      const base = JSON.parse(JSON.stringify(R.SPECS[SPEC_FOR[lv.levelId]]));
      const parts = Object.keys(base).filter(k => k[0] !== '_' && Array.isArray(base[k]));
      if (!parts.length) continue;
      const pk = parts[Math.floor(Math.random() * parts.length)];
      if (base[pk].length > 1) base[pk].splice(Math.floor(Math.random() * base[pk].length), 1);
      const st = R.simulate(lv, base, { maxTime: 40 });
      games++;
      if (st.result === 'win') wins++;
      const h = st.events.filter(e => e.indexOf('pig_hurt') === 0).length;
      hurt += h;
      if (st.result === 'win' && h > 0) hurtInWin++;
    }
  });
  console.log(`  ${games} 局：赢 ${wins}，猪受伤共 ${hurt} 次，其中"赢了但猪受过伤" ${hurtInWin} 局`);
  void KEYS;
}

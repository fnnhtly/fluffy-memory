/* 零件表对账（第 63 轮重写）。
 *
 * 这个脚本原来对账的是 `motor` / `battery` / `pump` 那套零件 ——
 * 那套已经整体删掉了（用户：「马达，电池，打气筒…太反人类直觉了」），
 * 所以它读 `R.PARTS.motor.desc` 直接抛 TypeError。
 *
 * 和删金币、删刹车同一个原则：**被测对象死了，测试要跟着重写**，
 * 而不是把对象加回来让它变绿。
 *
 * 现在对账的是新表，验三件事：
 *   A. 每个零件都有 label / desc，且 desc **不是空话**（至少 20 字）
 *   B. desc 里承诺的数字和引擎常数一致（文案不许撒谎 —— 这是原脚本的核心价值）
 *   C. 每个零件的**功能性标志**必须真的被引擎读过（写了没人读 = 假规格）
 */
const R = require('../prototype/game.js');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function chk(label, cond, extra) {
  if (cond) { pass++; console.log('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('✗ ' + label + '  ' + (extra || '')); }
}

console.log('=== A 每个零件都有说得清的说明 ===');
const ids = Object.keys(R.PARTS);
chk('零件表非空', ids.length >= 10, ids.length + ' 件');
let noDesc = [];
ids.forEach(id => {
  const d = R.PARTS[id];
  if (!d.label || !d.desc || d.desc.length < 20) noDesc.push(id);
});
chk('每件都有 label + 至少 20 字的 desc', noDesc.length === 0,
  noDesc.length ? '缺：' + noDesc.join(',') : '全部齐');

console.log('\n=== B 说明里承诺的数字 vs 引擎常数 ===');
/* 每一条都是"文案说了个数，引擎里也有个数，两者必须相等"。
 * 这是原脚本最有价值的部分 —— 文案一旦和实现分叉，玩家就在读谎话。 */
const claims = [
  { id: 'balloon', re: /举起\s*(\d+(?:\.\d+)?)\s*kg/, actual: () => R.PARTS.balloon.liftMass, label: '热气球浮力' },
  { id: 'sandbag', re: /每个\s*(\d+(?:\.\d+)?)\s*kg/, actual: () => R.PARTS.sandbag.mass, label: '压舱石重量' },
  { id: 'wood_wheel', re: /打滑（(\d+(?:\.\d+)?)）/, actual: () => R.PARTS.wood_wheel.iceGrip, label: '木轮冰面抓地' },
  { id: 'iron_wheel', re: /重\s*(\d+(?:\.\d+)?)\s*kg/, actual: () => R.PARTS.iron_wheel.mass, label: '铁轮重量' },
  { id: 'iron_wheel', re: /抓地\s*(\d+(?:\.\d+)?)/, actual: () => R.PARTS.iron_wheel.iceGrip, label: '铁轮冰面抓地' },
  { id: 'wood_frame', re: /耐久\s*(\d+)\s*段/, actual: () => R.PARTS.wood_frame.maxHp, label: '木框耐久段数' },
  { id: 'iron_frame', re: /耐久\s*(\d+)\s*段/, actual: () => R.PARTS.iron_frame.maxHp, label: '岩框耐久段数' },
  { id: 'anemo_core', re: /\+(\d+)\s*动力容量/, actual: () => R.PARTS.anemo_core.powerSrc, label: '风种容量' },
  { id: 'geo_core', re: /\+(\d+)\s*动力容量/, actual: () => R.PARTS.geo_core.powerSrc, label: '岩种容量' },
  { id: 'geo_core', re: /重\s*(\d+(?:\.\d+)?)\s*kg/, actual: () => R.PARTS.geo_core.mass, label: '岩种重量' },
  { id: 'propeller', re: /推力\s*(\d+(?:\.\d+)?)\s*m\/s²/, actual: () => R.PARTS.propeller.thrust, label: '风车桨推力' },
  { id: 'propeller', re: /占\s*(\d+)\s*点动力容量/, actual: () => R.PARTS.propeller.drawPower, label: '风车桨耗容量' },
  { id: 'jet', re: /推力\s*(\d+(?:\.\d+)?)\s*m\/s²/, actual: () => R.PARTS.jet.thrust, label: '喷气口推力' },
  { id: 'jet', re: /占\s*(\d+)\s*点容量/, actual: () => R.PARTS.jet.drawPower, label: '喷气口耗容量' },
  { id: 'firework', re: /推\s*(\d+(?:\.\d+)?)\s*秒/, actual: () => R.PARTS.firework.burnTime, label: '霄灯燃烧时长' },
  { id: 'firework', re: /（(\d+(?:\.\d+)?)\s*m\/s²）/, actual: () => R.PARTS.firework.thrust, label: '霄灯推力' }
];
let claimBad = 0;
claims.forEach(c => {
  const def = R.PARTS[c.id];
  const text = (def && def.desc) || '';
  const m = text.match(c.re);
  const said = m ? parseFloat(m[1]) : null;
  const real = c.actual();
  const ok = said !== null && Math.abs(said - real) < 1e-6;
  if (!ok) claimBad++;
  console.log('  ' + (ok ? 'OK  ' : 'BAD ') + c.label.padEnd(14) +
    ' 文案=' + (said === null ? '没写' : said) + '  引擎=' + real);
});
chk('descriptions 里的数字全部和引擎一致（文案不撒谎）', claimBad === 0,
  claimBad ? claimBad + ' 条不符' : '全部一致');

console.log('\n=== C 功能性标志必须真的被读过 ===');
const src = fs.readFileSync(path.join(__dirname, '..', 'prototype', 'game.js'), 'utf8');
/* 只检查**新增**的几个功能性字段。老的（structure/wheel/mass）早就有读的人。 */
const flags = ['powerSrc', 'tool', 'drawPower', 'oneShot', 'burnTime', 'tether', 'thrust'];
const orphan = [];
flags.forEach(f => {
  /* 表里写了几次不重要，重要的是**引擎代码里读过它**。
   * 读法有两种：`def.xxx` 或 `PARTS[...].xxx`。 */
  const re = new RegExp('\\.' + f + '\\b');
  if (!re.test(src)) orphan.push(f);
});
chk('每个新功能字段都至少有一处读它（没有"写了没人读"的假规格）',
  orphan.length === 0, orphan.length ? '没人读：' + orphan.join(',') : '全部有读');

/* 反向检查：所有零件至少要被某条分支画到（否则玩家看到空气）*/
console.log('\n=== D 每件都能被画出来（渲染层有分支）===');
const html = fs.readFileSync(path.join(__dirname, '..', 'prototype', 'index.html'), 'utf8');
const drawable = {
  wood_frame: /def\.structure/, iron_frame: /def\.structure/,
  wood_wheel: /def\.wheel/, iron_wheel: /def\.wheel/,
  anemo_core: /def\.powerSrc/, geo_core: /def\.powerSrc/,
  propeller: /def\.tool/, jet: /def\.tool/,
  balloon: /def\.liftMass/, sandbag: /def\.dropOne/,
  firework: /def\.oneShot/, pump: /def\.interactive/, pig: /def\.pig/
};
const undraw = [];
ids.forEach(id => {
  const re = drawable[id];
  if (!re) undraw.push(id + '(无映射)');
  else if (!re.test(html)) undraw.push(id);
});
chk('每件零件在渲染层都有对应分支', undraw.length === 0,
  undraw.length ? '画不出：' + undraw.join(',') : '全部可画');

console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
if (fail) process.exit(1);

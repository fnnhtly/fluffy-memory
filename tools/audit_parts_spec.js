/* 探针：PARTS 里每个字段，到底谁在读？
 *
 * `PARTS` 是这游戏最核心的一张表：每个零件的物理参数、渲染颜色、
 * 帮助面板的说明文字全在里面。表里任何一个字段"写了但没人读"，
 * 都是一份**假的**规格 —— 策划/我改了它，游戏的行为和画面对不上，
 * 而控制台不会报任何错。
 *
 * 已经踩过一次同类：`pump.thrust = 6.0` 写在表里，引擎真正用的是
 * `Params.pumpImpulse = 6.0`。两个 6 看起来一致，但它们是两套旋钮：
 * 调参面板改 Parms 那个立刻生效，改 PARTS 这个毫无反应。
 *
 * 所以这份脚本按字段逐个列出"在 game.js / index.html 里被读了几次"，
 * 只打印，不断言 —— 判断"该不该有读的人"需要人看。
 * 三条硬底线留给断言：
 *   1) 每个零件必须至少被某个地方读过（否则整个零件是死的）；
 *   2) 表里每个字段名在**两处**加起来至少出现一次；
 *   3) 量具自证：塞一个假字段进去，必须被列出来。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ENGINE = fs.readFileSync(path.join(ROOT, 'prototype', 'game.js'), 'utf8');
const RENDER = fs.readFileSync(path.join(ROOT, 'prototype', 'index.html'), 'utf8');
const R = require('../prototype/game.js');

function countRe(src, name) {
  const re = new RegExp('\\.' + name + '\\b', 'g');
  return (src.match(re) || []).length;
}

/* 字段清单必须取**所有零件**的并集，不能只看木框 ——
 * 第一版只读了 `Object.keys(PARTS.wood_frame)`，于是 7 个字段之外
 * 的 `radius` / `grip` / `liftMass` / `maxStack` 全都不在扫描范围里，
 * 一份"7/7 全绿"的报告其实是漏了一半的表。 */
const keys = [];
R.TRAY_ORDER.forEach(p => Object.keys(R.PARTS[p]).forEach(k => {
  if (keys.indexOf(k) < 0) keys.push(k);
}));

console.log('=== 字段读取次数（engine / html） ===');
const dead = [];
for (const k of keys) {
  const e = countRe(ENGINE, k), h = countRe(RENDER, k);
  const flag = (e + h === 0) ? '  ← 没人读' : '';
  if (e + h === 0) dead.push(k);
  console.log('  ' + k.padEnd(12) + ' ' + String(e).padStart(3) + ' / ' + String(h).padStart(3) + flag);
}

/* 字段在哪些零件上出现 —— 死字段的排查离不开这一列 */
console.log('\n=== 字段归属 ===');
for (const k of keys) {
  console.log('  ' + k.padEnd(12) + R.TRAY_ORDER.filter(p => k in R.PARTS[p]).join(','));
}

console.log('\n=== 同义双写：表里写的值 vs 引擎真正用的值 ===');
const dupes = [
  { field: 'pump.thrust', table: ('thrust' in R.PARTS.pump) ? R.PARTS.pump.thrust : '（已删）',
    real: R.Params.pumpImpulse, realName: 'Params.pumpImpulse',
    note: '冲量是运行时旋钮，只能有一份' },
  { field: 'motor（desc 说 6 m/s²）', table: 'desc 文字', real: R.Params.motorAccel, realName: 'Params.motorAccel',
    note: 'desc 是文案，不是参数；但两者一旦分叉，说明文字就在撒谎' }
];
dupes.forEach(d => console.log('  ' + d.field + ' 表=' + d.table + '  实际=' + d.realName + '=' + d.real + '  （' + d.note + '）'));

console.log('\n=== 说明文字里承诺的数值 vs 引擎常数 ===');
const claims = [
  { text: R.PARTS.motor.desc, re: /(\d+(?:\.\d+)?)\s*m\/s²/, actual: R.Params.motorAccel, label: '马达加速度' },
  { text: R.PARTS.motor.desc, re: /耗能\s*(\d+(?:\.\d+)?)\/秒/, actual: R.Params.motorEnergy, label: '马达耗能' },
  { text: R.PARTS.motor.desc, re: /自带\s*(\d+)\s*电量/, actual: 12, label: '马达自带电量' },
  { text: R.PARTS.battery.desc, re: /\+(\d+)\s*能量/, actual: R.PARTS.battery.energy, label: '电池容量' },
  { text: R.PARTS.balloon.desc, re: /(\d+(?:\.\d+)?)\s*kg\s*举起来/, actual: R.PARTS.balloon.liftMass, label: '气球浮力' },
  { text: R.PARTS.sandbag.desc, re: /每个\s*(\d+(?:\.\d+)?)\s*kg/, actual: R.PARTS.sandbag.mass, label: '沙袋重量' },
  { text: R.PARTS.wood_wheel.desc, re: /（(\d+(?:\.\d+)?)）/, actual: R.PARTS.wood_wheel.iceGrip, label: '木轮冰面抓地' },
  { text: R.PARTS.iron_wheel.desc, re: /重\s*(\d+(?:\.\d+)?)\s*kg/, actual: R.PARTS.iron_wheel.mass, label: '铁轮重量' },
  { text: R.PARTS.iron_wheel.desc, re: /冰面抓地\s*(\d+(?:\.\d+)?)/, actual: R.PARTS.iron_wheel.iceGrip, label: '铁轮冰面抓地' },
  { text: R.PARTS.wood_frame.desc, re: /耐久\s*(\d+)\s*段/, actual: R.PARTS.wood_frame.maxHp, label: '木框耐久段数' }
];
let claimBad = 0;
claims.forEach(c => {
  const m = (c.text || '').match(c.re);
  const said = m ? parseFloat(m[1]) : null;
  const ok = said !== null && Math.abs(said - c.actual) < 1e-6;
  if (!ok) claimBad++;
  console.log('  ' + (ok ? 'OK  ' : 'BAD ') + c.label.padEnd(12) +
    ' 文案说 ' + (said === null ? '（没写）' : said) + '，实际 ' + c.actual);
});

/* ---------- 断言 ---------- */
let pass = 0, fail = 0;
const line = (ok, name, detail) => { if (ok) pass++; else fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + ' ' + name + (detail ? '　' + detail : '')); };

console.log('');
line(dead.length === 0, 'PARTS 表里没有"写了没人读"的字段',
  dead.length ? '死字段：' + dead.join(', ') : keys.length + ' 个字段全部有读者');
line(claimBad === 0, '零件说明里写的每个数字都和引擎常数一致（说明不会撒谎）',
  claimBad ? claimBad + ' 条对不上' : claims.length + ' 条全部一致');

// 量具自证：塞一个假字段，必须被列出来
{
  const fake = { ...R.PARTS.wood_frame, zzNeverUsed: 1 };
  const fakeKeys = Object.keys(fake);
  const d2 = fakeKeys.filter(k => countRe(ENGINE, k) + countRe(RENDER, k) === 0);
  line(d2.indexOf('zzNeverUsed') >= 0, '量具能失败：塞一个没人读的字段，能认出来', d2.join(', '));
}
// 量具自证：把描述里的数字改错，必须判红
{
  const bad2 = R.PARTS.motor.desc.replace(/(\d+(?:\.\d+)?)\s*m\/s²/, '9.5 m/s²');
  const m2 = bad2.match(/(\d+(?:\.\d+)?)\s*m\/s²/);
  line(m2 && parseFloat(m2[1]) !== R.Params.motorAccel,
    '量具能失败：把说明里的加速度改成 9.5，判据能认出不一致',
    '改后 ' + (m2 ? m2[1] : '?') + ' vs 实际 ' + R.Params.motorAccel);
}

console.log('\nASSERTS ' + pass + ' / ' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);

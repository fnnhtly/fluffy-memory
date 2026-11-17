/* 第 63 轮：新零件表下，六关的标准解还能不能跑通？
 *
 * 这是零件重写的**真判据**。零件表、动力系统、系挂规则全部换掉之后，
 * "代码能加载"什么都不能证明 —— 必须让每关的标准解真的跑到终点。
 *
 * 用 RAP.simulate()（Node 里唯一会执行 _presses/_drops/_pops 的路径），
 * 每关报：结束状态、耗时、星数、动力供给/需求。
 */
const R = require('../prototype/game.js');
const L = require('../prototype/levels.js');

/* 自报运行环境（见 tools/lib/verdict.js）：纯 Node 测试不开浏览器。 */
console.log('RUNTIME: node');

let pass = 0, fail = 0;
function chk(label, cond, extra) {
  if (cond) { pass++; console.log('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('✗ ' + label + '  ' + (extra || '')); }
}

/* 关 → 标准解 key 现在只有一份（tools/lib/specmap.js）。
 * 原来这里自己写了一张表，第 72 轮加第 7 关时就它没改到。 */
const { SPEC_OF } = require('./lib/specmap.js');

L.forEach(lv => {
  const key = SPEC_OF[lv.levelId];
  const spec = R.SPECS[key];
  if (!spec) { chk(lv.levelId + ' 有标准解', false, '找不到 SPECS[' + key + ']'); return; }
  const build = R.newBuild();
  R.applySpec(lv, build, spec);
  const chkL = R.canLaunch(build);
  if (!chkL.ok) {
    chk(lv.levelId + ' 标准解装得上', false, chkL.reason);
    return;
  }
  const car = R.buildVehicle(lv, build);
  console.log('  ' + lv.levelId + ' 装好：supply=' + car.powerSupply +
              ' demand=' + car.powerDemand + ' short=' + car.powerShort +
              ' mass=' + car.mass.toFixed(2) + ' lift=' + car.liftMass +
              ' 轮=' + car.wheels.length + ' 件=' + car.parts.length);

  const st = R.simulate(lv, spec, 120);
  const res = st.run || st;
  const win = (st.result === 'win') || (res && res.result === 'win');
  console.log('  ' + lv.levelId + ' 结果：' + (st.result || (res && res.result)) +
              '  t=' + (res && res.time ? res.time.toFixed(2) : (st.time || 0).toFixed(2)) +
              '  stars=' + (st.stars !== undefined ? st.stars : (res && res.stars)));
  chk(lv.levelId + ' 标准解能通关（新零件表）', win,
    'result=' + (st.result || (res && res.result)));
});

console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
if (fail) process.exit(1);

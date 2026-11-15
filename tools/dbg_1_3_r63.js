/* 为什么 1-3 的标准解跑到 x=7.28 就不动了？
 * 新零件：风种(2 容量) + 风车桨(5 m/s²) + 2 木轮。
 * 地形是平地。理论上一路加速应该走得很远。
 */
const R = require('../prototype/game.js');
const L = require('../prototype/levels.js');

const lv = L[2];
const build = R.newBuild();
R.applySpec(lv, build, R.SPECS['1-3']);
const car = R.buildVehicle(lv, build);
console.log('车：mass=' + car.mass.toFixed(2) +
            ' supply=' + car.powerSupply + ' demand=' + car.powerDemand);
const props = car.parts.filter(p => p.part === 'propeller');
props.forEach(p => console.log('  桨 dir=' + p.dir + ' powered=' + p.powered +
                               ' thrust=' + p.def.thrust));

const st = R.createRun(lv, build);
const seen = [];
for (let i = 0; i < 60 * 12; i++) {
  R.step(st, 1 / 60);
  if (i % 30 === 0) {
    seen.push({ t: +st.time.toFixed(2), x: +st.car.x.toFixed(2),
                vx: +st.car.vx.toFixed(2), a: +st.car.a.toFixed(3),
                ax: +st.car.x.toFixed(2) });
  }
  if (st.result) break;
}
seen.forEach(s => console.log('  t=' + s.t + '  x=' + s.x + '  vx=' + s.vx));
console.log('结果：' + st.result + ' / ' + st.failReason +
            '  t=' + st.time.toFixed(2) + '  x=' + st.car.x.toFixed(2));
console.log('事件：', (st.events || []).filter(e => /power|stuck|tool/.test(e)).slice(0, 8));

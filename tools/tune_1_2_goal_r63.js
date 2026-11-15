/* 1-2 的终点要挪多远，才能让"必须按一下"这件事重新成立？
 *
 * 第 63 轮换了零件表之后，1-2 的车变轻了（不再有马达 1.8 kg + 电池 1.0 kg），
 * 一路滑下来就冲过了 col 14 —— 于是"按一下"这个教学点失效
 * （tools/test_launch_spec 报「同一个摆法、不按就打不到终点」红）。
 *
 * 这个脚本扫一遍终点列，找出"不按过不去、按了过得去"的窗口。
 */
const R = require('../prototype/game.js');
const L = require('../prototype/levels.js');

console.log('RUNTIME: node');

const BASE = L[1];
const specPress = JSON.parse(JSON.stringify(R.SPECS['1-2']));
const specNo = JSON.parse(JSON.stringify(R.SPECS['1-2']));
delete specNo._presses;

console.log('当前 1-2：cols=' + BASE.grid.cols + ' goal=' + BASE.goal.col);

const rows = [];
for (let goal = 14; goal <= 34; goal += 2) {
  const lv = JSON.parse(JSON.stringify(BASE));
  lv.goal = { col: goal };
  let noWin = false, pressWin = false;
  let noX = 0, pressX = 0;
  try {
    const st = R.simulate(lv, specNo, 120);
    const r = st.run || st;
    noWin = (st.result || r.result) === 'win';
    noX = r.car ? r.car.x : 0;
  } catch (e) { noX = -1; }
  try {
    const st = R.simulate(lv, specPress, 120);
    const r = st.run || st;
    pressWin = (st.result || r.result) === 'win';
    pressX = r.car ? r.car.x : 0;
  } catch (e) { pressX = -1; }
  rows.push({ goal, noWin, pressWin, noX, pressX });
  console.log('  goal=' + String(goal).padStart(2) +
    '  不按→' + (noWin ? '赢' : '输') + '(x=' + noX.toFixed(1) + ')' +
    '  按了→' + (pressWin ? '赢' : '输') + '(x=' + pressX.toFixed(1) + ')');
}

/* 理想的 window：不按输、按了赢 */
const good = rows.filter(r => !r.noWin && r.pressWin);
console.log('');
if (!good.length) {
  console.log('✗ 没有任何终点列能让"必须按一下"成立');
  process.exit(1);
}
console.log('✓ 可用终点列：' + good.map(r => r.goal).join(', ') +
            '（不按过不去，按了过得去）');
console.log('建议取最靠前的那个：goal.col = ' + good[0].goal);

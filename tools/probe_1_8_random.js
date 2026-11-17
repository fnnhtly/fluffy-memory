/* 1-8 为什么在随机造法下几乎不可达（第 83 轮）。
 *
 * 上一版把触发时刻范围扩到 0.6~6.0，1-8 仍然 0%。
 * 那说明拦路的不是触发时刻，是**别的必要条件**。
 *
 * 1-8 的通关条件拆开：
 *   ① 有风种（randomBuild 75%）
 *   ② 有吃风件（umbrella / wind_wing，60%）
 *   ③ 有螺旋桨/喷气口（45%）
 *   ④ 触发时刻落在 **3.75~6.0 秒**（随机 0.6~6.0 里约 37%）
 *   ⑤ 车在触发那一刻**正好在坡脚**
 *
 * ①②③④ 的联合概率已经很低，⑤ 还要求"造法本身能跑到坡脚"。
 * 这个探针逐个固定条件，量出到底是哪一个卡住。
 */
const R = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');
const { randomBuild } = require('./lib/random_build.js');

const LV = LEVELS[7];
const N = 300;

/* 逐级放开条件，看通关率怎么变 */
function rate(mutate, label) {
  let win = 0;
  for (let i = 0; i < N; i++) {
    const spec = randomBuild(LV);
    mutate(spec);
    const st = R.simulate(LV, spec, { maxTime: 70 });
    if (st.result === 'win') win++;
  }
  console.log('  ' + label.padEnd(46) + (win / N * 100).toFixed(1) + '%');
  return win / N * 100;
}

console.log('1-8 逐级放开条件（每级 ' + N + ' 局）：');
rate(() => {}, '全随机');

rate(s => {
  /* 强制有风种 + 触发 */
  s.anemo_core = [[4, 2]];
  s._seeds = [{ t: 4.5, kind: 'anemo' }];
}, '强制：风种 + t=4.5 触发');

rate(s => {
  s.anemo_core = [[4, 2]];
  s._seeds = [{ t: 4.5, kind: 'anemo' }];
  s.umbrella = [[3, 2]];
}, '+ 强制伞');

rate(s => {
  s.anemo_core = [[4, 2]];
  s._seeds = [{ t: 4.5, kind: 'anemo' }];
  s.umbrella = [[3, 2]];
  s.propeller = [[3, 1]];
  s._dirs = { propeller: 0 };
}, '+ 强制螺旋桨朝右');

/* 再放开触发时刻 */
{
  let win = 0;
  for (let i = 0; i < N; i++) {
    const spec = randomBuild(LV);
    spec.anemo_core = [[4, 2]];
    spec.umbrella = [[3, 2]];
    spec.propeller = [[3, 1]];
    spec._dirs = { propeller: 0 };
    spec._seeds = [{ t: +(3.6 + Math.random() * 2.6).toFixed(2), kind: 'anemo' }];
    const st = R.simulate(LV, spec, { maxTime: 70 });
    if (st.result === 'win') win++;
  }
  console.log('  ' + '四个必要条件都强制 + 触发 3.6~6.2'.padEnd(46) +
    (win / N * 100).toFixed(1) + '%');
}

/* 标准解作为上界 */
{
  let win = 0;
  for (let i = 0; i < 20; i++) {
    const st = R.simulate(LV, JSON.parse(JSON.stringify(R.SPECS['1-8'])), { maxTime: 70 });
    if (st.result === 'win') win++;
  }
  console.log('  ' + '标准解（上界）'.padEnd(46) + (win / 20 * 100).toFixed(1) + '%');
}

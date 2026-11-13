/* 1-2 的第三颗星：从「不按打气筒」改成「限时」。
 *
 * 为什么改：这一关叫「按一下」，可它的 ★★★ 奖励的是**不按**
 * （challenge: pumpPress max 0）。实测不按也能 2.80s 通关，
 * 所以关卡名义上在教打气筒，实际在教"别用它"。
 *
 * 但按确实有用 —— probe_level_1_2.js 里按一下能把 2.80s 压到 2.15s。
 * 也就是说这颗星只要换成「限时」，关卡名就名副其实了：
 * 想过关不用按，想拿三星必须按，而且最好按得早。
 *
 * 这个脚本标定阈值：扫一批按下时刻 / 按住时长，看通关时间分布，
 * 挑一个"必须按才达得到、但不用卡帧"的数。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');

const lv = L[1];
const FRAMES = { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]] };
const P1 = Object.assign({}, FRAMES, { pump: [[3, 2]] });

function simulate(spec, dir, presses) {
  RAP.resetParams({});
  const b = RAP.newBuild();
  RAP.applySpec(lv, b, spec);
  const st = RAP.createRun(lv, b);
  if (dir !== null && dir !== undefined) {
    st.car.parts.filter(p => p.def === RAP.PARTS.pump).forEach(p => { p.dir = dir; });
  }
  st.spawnGrace = 0.9;
  const dt = 1 / 60;
  const acts = (presses || []).slice().sort((a, b2) => a.t - b2.t);
  let ai = 0;
  while (st.phase === 'run' && st.time < 40) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      if (acts[ai].kind === 'press') RAP.pressInteract(st, 1);
      else RAP.releaseInteract(st, 1);
      ai++;
    }
    RAP.step(st, dt);
  }
  return { result: st.result || '未结束', time: st.time, presses: st.pumpPress };
}

console.log('当前 1-2 干草稿：不按 vs 按一下');
console.log('  不按            → ' + simulate(FRAMES, null, []).time.toFixed(2) + 's');
console.log('  不装打气筒      → ' + simulate(FRAMES, null, []).time.toFixed(2) + 's');

// 先看打气筒默认朝向（放置后 dir 可能是 0=右）
['朝右', '朝上', '朝左', '朝下'].forEach((tag, d) => {
  const r = simulate(P1, d, [{ t: 0.6, kind: 'press' }, { t: 1.4, kind: 'release' }]);
  console.log('  ' + tag.padEnd(16) + '→ ' + r.result.padEnd(5) + ' t=' + r.time.toFixed(2) + 's');
});

// 早按 / 晚按 / 按两次，看时间分布
console.log('\n按下时刻 → 通关时间（朝右，按住 0.6s）');
const times = [];
for (let t0 = 0.2; t0 <= 2.4; t0 += 0.2) {
  const r = simulate(P1, 0, [{ t: t0, kind: 'press' }, { t: t0 + 0.6, kind: 'release' }]);
  if (r.result === 'win') times.push(r.time);
  console.log('  @' + t0.toFixed(1) + 's → ' + r.result.padEnd(5) + ' t=' + r.time.toFixed(2));
}

console.log('\n连按两次');
[0.4, 0.6, 0.8, 1.0].forEach(t0 => {
  const r = simulate(P1, 0, [
    { t: t0, kind: 'press' }, { t: t0 + 0.5, kind: 'release' },
    { t: t0 + 0.9, kind: 'press' }, { t: t0 + 1.4, kind: 'release' }
  ]);
  console.log('  起 ' + t0.toFixed(1) + 's 两下 → ' + r.result.padEnd(5) + ' t=' + r.time.toFixed(2));
});

if (times.length) {
  times.sort((a, b) => a - b);
  console.log('\n单次喷气通关时间：最快 ' + times[0].toFixed(2) + '  中位 ' +
    times[Math.floor(times.length / 2)].toFixed(2) + '  最慢 ' + times[times.length - 1].toFixed(2));
  console.log('不按通关时间 ' + simulate(FRAMES, null, []).time.toFixed(2) +
    ' → 阈值要卡在这两者之间');
}

/* 探针：1-6 的"什么时候扔沙袋"到底有多宽？
 *
 * 横幅在开局 2 秒里写着"点沙袋扔掉"，关键动作却在 t≈4.5 s。
 * 玩家最自然的反应是**立刻**扔（横幅还在的时候）。那么：
 *   - 立刻扔会赢吗？
 *   - 允许的窗口有多宽？
 *
 * 如果宽到"随便什么时候扔都行"，这一关的"节奏"就是假的；
 * 如果窄到 ±0.5 秒，那横幅必须说得更具体，否则是刁难。
 */
const R = require('../prototype/game.js');
const L = require('../prototype/levels.js');
const levels = L.levels || L;
const lv = levels[5];

function play(dropT, popT) {
  const st = R.createRun(lv, (() => {
    const b = R.newBuild(); R.applySpec(lv, b, R.SPECS['1-6']); return b;
  })());
  const acts = [];
  for (let i = 0; i < 3; i++) acts.push({ t: dropT + i * 0.016, k: 'drop' });
  acts.push({ t: popT, k: 'pop' });
  acts.sort((a, b) => a.t - b.t);
  let ai = 0;
  for (let i = 0; i < 60 * 70; i++) {
    while (ai < acts.length && acts[ai].t <= st.time) {
      const a = acts[ai++];
      if (a.k === 'drop') R.dropSandbag(st, 1); else R.popBalloon(st, 1);
    }
    R.step(st, 1 / 60);
    if (st.result) break;
  }
  return { res: st.result || 'timeout', t: st.time, why: st.failReason || '' };
}

console.log('=== 固定 pop=8.0，扫 drop 时刻 ===');
let winLo = null, winHi = null;
for (let d = 0; d <= 9.0; d += 0.5) {
  const r = play(d, 8.0);
  const ok = r.res === 'win';
  if (ok && winLo === null) winLo = d;
  if (ok) winHi = d;
  console.log('  drop@' + d.toFixed(1) + 's → ' + r.res +
    (ok ? ' ★' + (r.t).toFixed(2) + 's' : ' ' + (r.why || '') + ' @' + r.t.toFixed(2) + 's'));
}
console.log('  → drop 的可接受区间：' + (winLo === null ? '无解' :
  winLo.toFixed(1) + ' ~ ' + winHi.toFixed(1) + ' s（宽 ' + (winHi - winLo + 0.5).toFixed(1) + ' s）'));

console.log('\n=== 固定 drop=4.5，扫 pop 时刻 ===');
let pLo = null, pHi = null;
for (let p = 4.6; p <= 12.0; p += 0.5) {
  const r = play(4.5, p);
  const ok = r.res === 'win';
  if (ok && pLo === null) pLo = p;
  if (ok) pHi = p;
  console.log('  pop@' + p.toFixed(1) + 's → ' + r.res +
    (ok ? ' ★' + (r.t).toFixed(2) + 's' : ' ' + (r.why || '') + ' @' + r.t.toFixed(2) + 's'));
}
console.log('  → pop 的可接受区间：' + (pLo === null ? '无解' :
  pLo.toFixed(1) + ' ~ ' + pHi.toFixed(1) + ' s（宽 ' + (pHi - pLo + 0.5).toFixed(1) + ' s）'));

console.log('\n=== 玩家最可能做的事 ===');
console.log('  A. 开局立刻全扔（drop@0.3, pop@0.35）：' + JSON.stringify(play(0.3, 0.5)));
console.log('  B. 开局立刻全扔但拖着不扎（drop@0.3, pop@8.0）：' + JSON.stringify(play(0.3, 8.0)));
console.log('  C. 完全不扔（用一个离谱的晚时间模拟）：' + JSON.stringify(play(40, 40)));
console.log('  D. 标准解：' + JSON.stringify(play(4.5, 8.0)));

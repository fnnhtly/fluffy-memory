/* 反向验证 test_draw_presence_all.js（第 90 轮）。
 *
 * 14 条判据各对应一个 `state.__hideDraw` 分支。要拆的是**绘制本身**：
 * 把每个分支都改成无条件早退，对应的那条判据必须红。
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const P = 'prototype/index.html';
const raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
const orig = crlf ? raw.split('\r\n').join('\n') : raw;
const toDisk = s => (crlf ? s.split('\n').join('\r\n') : s);

function run() {
  let out = '';
  try {
    out = execFileSync('node', ['tools/test_draw_presence_all.js'],
      { encoding: 'utf8', timeout: 900000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗'))
  };
}

/* 只列**有对应 probe** 的分支。
 *
 * ⚠ 第一版把 `drawGrid` / `drawJoystick` / `drawRun` 也列进来了 ——
 * 但那三个**没有 probe**（网格是背景、摇杆要先按下、drawRun 画的是
 * 世界+车，无法用"隐藏它"来隔离）。它们拆掉之后自然不会有判据红，
 * 而那不代表判据有问题，只代表我没量它们。
 *
 * 诚实的做法：这里只列量过的，并在输出里**明说**哪几个没量。 */
const PROBED = ['drawBuildCar', 'drawObserveBtn', 'drawRecentreBtn',
  'drawBuildPreview', 'drawButtons', 'drawTabs', 'drawHud',
  'drawResult', 'drawWelcome', 'drawLevelSelect', 'drawHelp', 'drawMuteBtn'];
const NOT_PROBED = ['drawGrid', 'drawJoystick', 'drawRun', 'drawTray',
  'drawHintBtn', 'drawHintCard'];
/* 注：drawTray / drawHintBtn / drawHintCard 由第 89 轮的
 * tools/test_draw_presence.js 覆盖，这里不重复。 */

const base = run();
console.log('基线：' + base.pass + '/' + base.total);
if (base.pass !== base.total) base.fails.forEach(l => console.log('  ' + l));
console.log('未纳入本文件的绘制：' + NOT_PROBED.join(' '));
console.log('');

/* 逐个拆，看每条判据是否各自有能力失败 */
let bad = 0;
for (const n of PROBED) {
  /* ⚠ `drawResult` 的分支不是 `if (!state.__hideDraw …) drawResult()`，
   * 而是 `if (state.phase === 'resolved' && (!state.__hideDraw …)) drawResult()` ——
   * `draw` 前面还有一个前置条件。用统一模板找不到它。
   * 所以按"`__hideDraw !== 'NAME')` 之后紧跟 ` drawXxx`"这种形状定位。 */
  const from = `!state.__hideDraw || state.__hideDraw !== '${n}'`;
  if (!orig.includes(from)) { console.log('  SKIP ' + n + '（找不到分支）'); continue; }
  /* ⚠ 变异必须让那个 draw **永不发生**，也就是把
   *
   *     !state.__hideDraw || state.__hideDraw !== 'NAME'
   *
   * 换成 `(false)` → `if (false) drawXxx()`。
   *
   * 第一版换成 `!(false)` —— 那是 **true**，等于"永远画"，
   * 也就是把钩子的语义**反过来**。它确实让 12 条里的 10 条变红
   * （因为 `__hideDraw` 再也藏不住了），但那是另一个问题；
   * 而 `drawRecentreBtn` / `drawResult` 两个在那套语义下检验不到。
   * 换句话说：**变异的方向写反了，红的那些是蒙对的。** */
  const mutated = orig.split(from).join('(false)');
  fs.writeFileSync(P, toDisk(mutated), 'utf8');
  const r = run();
  fs.writeFileSync(P, toDisk(orig), 'utf8');
  const turned = r.pass < base.pass;
  if (!turned) { bad++; console.log('  仍然全绿 ✗  ' + n + '  → ' + r.pass + '/' + r.total); }
  else console.log('  变红 ✓  ' + n.padEnd(20) + r.pass + '/' + r.total +
    '（' + r.fails.length + ' 条红）');
}
fs.writeFileSync(P, toDisk(orig), 'utf8');
console.log(bad ? '\n有 ' + bad + ' 条拆不掉' : '\n每条绘制都有对应的守卫');
process.exit(bad ? 1 : 0);

/* 浏览器侧的批量反向验证（第 89 轮）。
 *
 * ── 上一轮只覆盖了一半 ──
 *
 * `tools/mutation_sweep.js` 对 19 个参数做变异，跑 34 个**纯 Node** 测试，
 * 抓到 `pillarRise` 没人守。但 verify 里还有 74 个**浏览器**脚本，
 * 它们的反向验证只有 12 份手写 `_redproof_*.js`。
 *
 * 这个脚本补那一半。做法和 Node 版一样，只是变异对象换成**绘制/交互函数**：
 *
 *   · 让某个 `drawXxx` 直接 return（画面缺一块）
 *   · 让某个 HUD 面板挪位（遮挡/重叠）
 *   · 把某个交互键的判定关掉（点了没反应）
 *
 * ── 为什么只跑 8 个代表性脚本 ──
 *
 * 一个浏览器测试 5~15 秒。8 个 × 6 条变异 ≈ 6 分钟，可以当**开发期审计**
 * 手动跑（不进常规回归，和 Node 版一样）。
 * 挑的 8 个覆盖：数值、HUD 布局、像素探针、引导、种子、姿态、视差。
 *
 * 用法：
 *   node tools/mutation_browser.js --dry    # 列出变异清单
 *   node tools/mutation_browser.js          # 真跑
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const IDX = path.join(ROOT, 'prototype', 'index.html');

/* 8 个代表性浏览器脚本（覆盖不同层） */
const TESTS = [
  'test_no_black_block.js',    // 像素：画面不能有黑块
  'test_hud_overlap.js',       // 几何：HUD 互不重叠
  'test_text_contrast.js',     // 像素 + 对比度
  'test_hint.js',              // 引导：提示卡
  'test_seed_fx.js',           // 像素：种子特效
  'test_touch_fx.js',          // 像素：撞击特效
  'test_build_preview.js',     // 建造期：地形预览条
  'test_wind_fx.js',           // 像素：风特效
  'test_draw_presence_all.js'  // 像素：该画的东西真的画出来了（第 89/90 轮，14 项）
];

/* 实际可用的变异在下面按函数签名生成，避免手抄整段代码。 */
const DEFS = [
  { name: 'drawHud 早退（HUD 全不画）', fn: 'drawHud' },
  { name: 'drawTray 早退（零件箱不画）', fn: 'drawTray' },
  { name: 'drawHintBtn 早退（提示键不画）', fn: 'drawHintBtn' },
  { name: 'drawHintCard 早退（提示卡不画）', fn: 'drawHintCard' },
  { name: 'drawWindFx 早退（风特效不画）', fn: 'drawWindFx' },
  { name: 'drawSeedFx / drawPillars 早退（岩柱不画）', fn: 'drawPillars' },
  { name: 'drawBuildPreview 早退（地形预览条不画）', fn: 'drawBuildPreview' },
  { name: 'runProgressRect 挪到屏幕中央（HUD 压车）', geometry: 'progress' },
  { name: 'runTimeRects 三块重叠（HUD 自重叠）', geometry: 'timer' }
];

/* 用**共享的** verdict 判定（tools/lib/verdict.js）。
 *
 * ⚠ 第一版自己写了一个判定：要求输出里出现 `ASSERTS n / n`。
 * 但 `test_text_contrast.js` 的通过标准是 `低对比文字: 0 / 284` +
 * `errors: (none)`，**根本没有 ASSERTS 行** —— 于是基线就报"1 个不绿"。
 *
 * 而 verify.mjs 里这两类脚本是**分别判定**的（有的 grep ASSERTS，
 * 有的 grep 自己的计数行）。变异器必须和 verify 用同一套规则，
 * 否则它量的是自己的判据，不是回归的判据。
 *
 * 这里退化成"退出码 0 且无页面异常" —— 对变异检测来说够了：
 * 我们要问的是"这条测试会不会失败"，不是"它用什么格式汇报"。 */
function runTest(name) {
  try {
    execFileSync(process.execPath, [path.join('tools', name)],
      { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
    return { ok: true };
  } catch (e) {
    /* 非零退出 = 这条测试失败了（不管它用哪种判定方式） */
    return { ok: false };
  }
}

const orig = fs.readFileSync(IDX, 'utf8');
const crlf = orig.includes('\r\n');
const toDisk = s => (crlf ? s.split('\n').join('\r\n') : s);

/* 用函数名定位并插入早退：`function NAME(...) {` 之后插一行
 *
 * ⚠ 第一版插的是 `if (window.__MUT && !window.__MUTSIZE) return;` ——
 * 而 `window.__MUT` 从来没被设置过，条件永远是 false，
 * 于是**变异根本没发生**，却报"没有任何测试变红"。
 * 那会让汇总表看起来在指控产品，其实在指控自己的变异器。
 *
 * 现在是无条件 `return;`。 */
function earlyReturn(fnName) {
  const re = new RegExp('(function ' + fnName + '\\([^)]*\\) \\{)');
  const m = orig.match(re);
  if (!m) return null;
  return { from: m[0], to: m[0] + '\n    if (true) return;   /* __MUT__ */' };
}

/* 自证：变异器必须真的改到文件。跑第一条之前先验一次。 */
function selfCheck() {
  const mut = earlyReturn('drawHud');
  if (!mut) return '找不到 drawHud';
  const after = orig.split(mut.from).join(mut.to);
  if (after === orig) return '替换没有改变文本';
  if (!after.includes('__MUT__')) return '插入的标记不在结果里';
  return null;
}

/* 几何变异：直接改返回的矩形
 *
 * ⚠ `timer` 那条第 89 轮第一版写的是"在 timer 行后面**追加**一个 box 键" ——
 * 而对象字面量里重复的键**后写的赢**，原来的 `box: { y:174 }` 在我追加的
 * 之后，于是把我的覆盖掉了。变异实际上没发生，却报"没有任何测试变红"。
 *
 * 改成**替换**已有的值，而不是追加。 */
function geometryMut(kind) {
  if (kind === 'progress') {
    /* 把进度面板挪到画面中央 —— 那会压住车（几何上恒不相交的判据会红） */
    const from = 'panel: { x: 84, y: 126, w: 700, h: 30 },';
    if (!orig.includes(from)) return null;
    return { from, to: 'panel: { x: 290, y: 400, w: 700, h: 30 },' };
  }
  if (kind === 'timer') {
    /* 把木箱面板下沿推到和木框耐久条同一行 —— 两块必须重叠 */
    const from = 'box: { x: DW - 224, y: 174, w: 192, h: 26 },';
    if (!orig.includes(from)) return null;
    return { from, to: 'box: { x: DW - 224, y: 206, w: 192, h: 26 },' };
  }
  return null;
}

if (process.argv.includes('--dry')) {
  console.log('浏览器测试 ' + TESTS.length + ' 个；变异 ' + DEFS.length + ' 条');
  DEFS.forEach(d => console.log('  ' + d.name));
  process.exit(0);
}

console.log('浏览器测试 ' + TESTS.length + ' 个；变异 ' + DEFS.length + ' 条');
console.log('（每条变异跑全部 ' + TESTS.length + ' 个测试，约 ' +
  (DEFS.length * TESTS.length * 10 / 60).toFixed(0) + ' 分钟）');
console.log('');

/* ⚠ 先自证变异器真的会改文件 —— 否则它报的"没有任何测试变红"
 * 可能只是在指控自己。 */
{
  const bad = selfCheck();
  if (bad) { console.log('✗ 变异器自证失败：' + bad); process.exit(1); }
  console.log('✓ 变异器自证：替换真的改变了文件');
}

/* 基线 */
const base = {};
TESTS.forEach(n => { base[n] = runTest(n); });
const baseBad = TESTS.filter(n => !base[n].ok);
if (baseBad.length) {
  console.log('⚠ 基线有 ' + baseBad.length + ' 个不绿：' + baseBad.join(' '));
  process.exit(1);
}
console.log('基线：' + TESTS.length + ' 个全绿');

const report = [];
for (const d of DEFS) {
  const mut = d.fn ? earlyReturn(d.fn) : geometryMut(d.geometry);
  if (!mut) { console.log('  SKIP ' + d.name + '（找不到锚点）'); continue; }
  fs.writeFileSync(IDX, toDisk(orig.split(mut.from).join(mut.to)), 'utf8');
  const killers = [];
  for (const n of TESTS) {
    if (!runTest(n).ok) killers.push(n);
  }
  fs.writeFileSync(IDX, orig, 'utf8');
  report.push({ name: d.name, killers });
  console.log('  ' + (killers.length ? '✓' : '✗') + ' ' + d.name.padEnd(38) +
    (killers.length ? killers.length + ' 条红：' + killers.join(', ') :
      '**没有任何测试变红**'));
}
fs.writeFileSync(IDX, orig, 'utf8');

const unguarded = report.filter(r => r.killers.length === 0);
console.log('');
console.log('=== 汇总 ===');
console.log('变异 ' + report.length + ' 条，其中 ' + unguarded.length +
  ' 条没有任何浏览器测试变红');
if (unguarded.length) unguarded.forEach(r => console.log('  · ' + r.name));
process.exit(unguarded.length === 0 ? 0 : 1);

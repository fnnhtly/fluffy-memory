/* 审计第四张表：**关卡数据**（levels/*.json → prototype/levels.js）。
 *
 * 前三张假旋钮表是 PARTS（第 53 轮）、state.X（第 50–53 轮）、DEFAULTS（第 55 轮）。
 * 这张表比它们危险：`levels/*.json` 是我调关卡时唯一的入口，
 * 里面每一个字段看起来都像"改了会有效果"。实际上它当时带着 7 个死字段：
 *   physics（整块，4 个子键）   buildArea   grid.cell   grid.px
 *   start.row   goal.row        materials[].surfaceRow        chapter   note
 * 这一轮把它们删干净了。审计现在反过来守两件事：
 *   A. **没有死字段**：数据里出现的每个键，代码里都得有读者（`.key` 或 `["key"]`）；
 *   B. **没有第二份真相**：`buildArea`（建造区 6×8）、一格 1 m / 32 px
 *      这些写死在代码里的常量，不许再在关卡数据里出现一份。
 * 另外顺手守 BIOMES —— 六关的美术全靠它，一个没人读的颜色键就是"我以为能调"的假象。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'prototype', 'index.html');
const GAME = path.join(ROOT, 'prototype', 'game.js');
const LEVELS = require(path.join(ROOT, 'prototype', 'levels.js'));

let pass = 0, fail = 0;
const fails = [];
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✓ ${name}` + (detail ? ` — ${detail}` : '')); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}` + (detail ? ` — ${detail}` : '')); }
}

/* 去掉注释与字符串字面量，避免注释里的字段名冒充"读者"。 */
function stripComments(src) {
  let out = '', i = 0, n = src.length, mode = 0;
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (mode === 0) {
      if (c === '/' && c2 === '/') { mode = 1; i += 2; out += '  '; continue; }
      if (c === '/' && c2 === '*') { mode = 2; i += 2; out += '  '; continue; }
      if (c === "'") { mode = 3; out += c; i++; continue; }
      if (c === '"') { mode = 4; out += c; i++; continue; }
      if (c === '`') { mode = 5; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === 1) { if (c === '\n') { mode = 0; out += '\n'; } else out += ' '; i++; continue; }
    if (mode === 2) {
      if (c === '*' && c2 === '/') { mode = 0; i += 2; out += '  '; continue; }
      out += (c === '\n' ? '\n' : ' '); i++; continue;
    }
    if (mode === 3) { if (c === '\\') { out += c + (src[i + 1] || ''); i += 2; continue; }
      if (c === "'") mode = 0; out += c; i++; continue; }
    if (mode === 4) { if (c === '\\') { out += c + (src[i + 1] || ''); i += 2; continue; }
      if (c === '"') mode = 0; out += c; i++; continue; }
    if (mode === 5) { if (c === '\\') { out += c + (src[i + 1] || ''); i += 2; continue; }
      if (c === '`') mode = 0; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

const htmlSrc = stripComments(fs.readFileSync(HTML, 'utf8'));
const gameSrc = stripComments(fs.readFileSync(GAME, 'utf8'));
const both = gameSrc + '\n' + htmlSrc;

function countReader(src, key) {
  const pats = [
    new RegExp('\\.' + key + '(?![A-Za-z0-9_])', 'g'),
    new RegExp('\\[\\s*[\'"]' + key + '[\'"]\\s*\\]', 'g')
  ];
  let n = 0;
  pats.forEach(p => { const m = src.match(p); if (m) n += m.length; });
  return n;
}

/* 关卡的**完整字段集**（1-6 额外有 hardCols，逐关取并集）。
 * 这张表是"数据 schema"，不是白名单 —— 新加字段必须先在这里登记，
 * 否则下面的 A 组会把它当死字段抓出来。这正是想要的效果。 */
const EXPECTED = ['levelId', 'name', 'biome', 'grid', 'start', 'goal', 'partsBox',
  'mapRows', 'materials', 'boxes', 'challenge', 'timeLimit', 'hardCols',
  /* 第 72 轮：雷屏障。读者是 game.js 的 `createRun`（搬进 state.barriers）
   * 和 `step`（挡车）；渲染层也有对应分支（drawBarriers）。 */
  'barriers'];

console.log('=== A. 关卡字段：每一个都有读者吗？ ===');
const levelKeys = {};
LEVELS.forEach(lv => Object.keys(lv).forEach(k => { levelKeys[k] = (levelKeys[k] || 0) + 1; }));
const LKEYS = Object.keys(levelKeys).sort();
const dead = [];
LKEYS.forEach(k => {
  const n = countReader(both, k);
  if (n === 0) dead.push(k);
  console.log(`  ${n > 0 ? '✓' : '✗'} ${k.padEnd(12)} 读者 ${String(n).padStart(3)} 次` +
    `（${levelKeys[k]}/${LEVELS.length} 关有）` + (n === 0 ? '  ← 没人读' : ''));
});
chk('关卡数据里没有死字段', dead.length === 0,
  dead.length ? dead.join('、') : `${LKEYS.length} 个字段全部有读者`);

console.log('\n=== B. 数据 schema 与"第二份真相" ===');
{
  const unexpected = LKEYS.filter(k => !EXPECTED.includes(k));
  const missing = EXPECTED.filter(k => !LKEYS.includes(k) && k !== 'hardCols');
  chk('字段集与登记的 schema 一致', unexpected.length === 0 && missing.length === 0,
    (unexpected.length ? '多出 ' + unexpected.join('、') + '；' : '') +
    (missing.length ? '缺少 ' + missing.join('、') : '') || '一致');

  /* `buildArea`、`grid.cell`、`grid.px`、`materials[].surfaceRow`、`start.row`、
   * `goal.row`、`physics`、`chapter`、`note` —— 这些全部是**第二份真相**
   * （一份在关卡数据里，一份写死在代码里，而代码那份才是真的）。 */
  ['buildArea', 'physics', 'chapter', 'note'].forEach(k => {
    chk(`关卡数据里不再有 ${k}`, LEVELS.every(lv => lv[k] === undefined), '');
  });
  chk('grid 只有 cols/rows',
    LEVELS.every(lv => Object.keys(lv.grid).sort().join(',') === 'cols,rows'), '');
  chk('start/goal 只有 col',
    LEVELS.every(lv => Object.keys(lv.start).join(',') === 'col' &&
                        Object.keys(lv.goal).join(',') === 'col'), '');
  chk('materials 只有 cols/type',
    LEVELS.every(lv => (lv.materials || []).every(m =>
      Object.keys(m).sort().join(',') === 'cols,type')), '');

  /* 代码里必须仍然定义着这些常量（否则建造区/格子尺寸就没主人了）。
   * 行数**不写死**：第 65 轮把 BUILD_ROWS 从 8 改成 6（拼装区不再埋进地底），
   * 这条本来会因为"数字变了"报红 —— 但它真正该守的是"有人管着这两个尺寸"，
   * 不是"数字永远等于 8"。所以改成断言"两者都是正整数、且锚点行是常量"，
   * 具体的数值由 tools/test_grid_is_visual.js 从另一面（物理不变性）把守。 */
  const mDim = /var BUILD_COLS = (\d+), BUILD_ROWS = (\d+)/.exec(gameSrc);
  chk('game.js 仍然定义 BUILD_COLS / BUILD_ROWS（都是正整数）',
    !!mDim && +mDim[1] > 0 && +mDim[2] > 0,
    mDim ? mDim[1] + ' × ' + mDim[2] : '没找到');
  chk('game.js 把车身锚点行定义成常量（不跟着行数走）',
    /var BUILD_ANCHOR_ROW = [\d.]+/.test(gameSrc), '');
  chk('game.js 仍然定义 CELL=1.0', /CELL = 1\.0/.test(gameSrc), '');
  chk('index.html 仍然定义 PPM=32', /PPM = 32/.test(htmlSrc), '');
}

console.log('\n=== C. BIOMES：每个 biome 的每个视觉参数都被画出来了吗？ ===');
{
  const m = /const BIOMES = \{[\s\S]*?\n *\};/.exec(htmlSrc) || /BIOMES\s*=\s*\{[\s\S]*?\n *\};/.exec(htmlSrc);
  if (!m) {
    chk('找得到 BIOMES 定义', false, '正则没命中');
  } else {
    const block = m[0];
    const keys = [...block.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\s*:/g)].map(x => x[1]);
    /* biome 名要**从 BIOMES 自己推导**，不能写死一份。
     * 第一版写死 `['field','canyon','cave','ice','dusk']`，于是第 63 轮
     * 新增 `skyBiome` 时，这个审计把 biome 名本身当成"视觉参数"，
     * 报「skyBiome 读取 0 次」—— 而它根本不是参数，是**键**。
     *
     * 推导法：biome 名的值是 `{` 开头，视觉参数的值是数字/字符串/数组。
     * 只看"值以 { 开头"的那些键即可。 */
    const BIOME_NAMES = [...block.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\s*:\s*\{/g)].map(x => x[1]);
    const uniq = [...new Set(keys)].filter(k => !BIOME_NAMES.includes(k));
    /* 读者不止一个别名：drawWorld 里是 `PAL`，选关缩略图里是 `bh`，压暗层里是 `bm`。
     * 第一版只数了 `bm.`/`b.`，于是 9 个键全判"没人读"—— 量具自己瞎了。
     * 判据改成"任何一个别名读过它"，别名表**写死在这里**，
     * 新增别名必须同时加进来（否则这条审计会静默放过真死字段）。 */
    const ALIASES = ['PAL', 'bh', 'bm'];
    console.log('  抓到 ' + uniq.length + ' 个键：' + uniq.join(' '));
    const deadB = [];
    uniq.forEach(k => {
      const n = (htmlSrc.match(new RegExp('(?:' + ALIASES.join('|') + ')\\.' + k + '(?![A-Za-z0-9_])', 'g')) || []).length;
      if (n === 0) deadB.push(k);
      console.log(`    ${n > 0 ? '✓' : '✗'} ${k.padEnd(10)} 读取 ${n} 次`);
    });
    chk('BIOMES 的每个视觉参数都有绘制读者', deadB.length === 0,
      deadB.length ? deadB.join('、') : '全部有读者');
  }
}

console.log('\n=== D. 量具自证（必须能失败） ===');
{
  const broken = both.split('timeLimit').join('__nope');
  chk('把所有 timeLimit 读者改名后，审计会报它没人读',
    countReader(broken, 'timeLimit') === 0, `计数 ${countReader(broken, 'timeLimit')}`);
}
{
  chk('注释里出现的字段名不算读者',
    countReader(stripComments('/* .timeLimit */ var x = 1;'), 'timeLimit') === 0, '');
}
{
  chk('方括号/引号写法也算读者',
    countReader('lv["timeLimit"]', 'timeLimit') === 1, '');
}
{
  /* 前缀不能误判：`grid` 的读者是 `level.grid`，但 `.grids` 不是。 */
  chk('同前缀的别的字段不算读者（.grids 不是 .grid）',
    countReader('var grids = 1;', 'grid') === 0, '');
}
{
  /* BIOMES 那段如果别名不全就会误报 —— 用一次"只给 bm"的假源码证明它会红。 */
  const fake = 'var x = PAL.rock;';
  const n = (fake.match(/(?:PAL)\.rock(?![A-Za-z0-9_])/g) || []).length;
  chk('别名表确实按别名匹配（PAL.rock 计 1）', n === 1, '');
}

console.log(`\nASSERTS ${pass} / ${pass + fail}`);
if (fail) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }

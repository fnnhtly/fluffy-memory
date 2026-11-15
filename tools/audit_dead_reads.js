/* 静态审计 · 反向：渲染层从**引擎状态对象**里读的字段，引擎写过吗？
 *
 * `tools/audit_state_fields.js` 的 A 组查的是"引擎写了、渲染层没人读"。
 * 这一支查的是另一半，也正是第 57 轮挖出的那个 bug 的形状：
 *
 *   else if ((state.run.lastImpactAt || -9) > now2 - 0.7) mood = 'dizzy';
 *   else if ((state.run.lastBoxAt    || -9) > now2 - 1.0) mood = 'happy';
 *
 * 引擎**从来没写过**这两个字段。`undefined || -9` 恒为 -9，永远小于 now-0.7，
 * 于是 dizzy 和"吃到木箱就笑"这两个分支从写下的那天起就是死的：
 * 不报错、不红测试、截图也看不出异常 —— 只是猪永远是同一个表情。
 *
 * 只带 `|| 兜底` 的读法特别危险：它让"字段不存在"伪装成"条件不成立"。
 *
 * ── 三点方法论 ──
 *   1. **别名表本身要被量**。渲染层里 `state.run` 有四个别名（state.run / st / car2 / car），
 *      每一个都必须在源码里找到赋值证据，找不到就说明我抄错了别名，
 *      后面的结论一律不作数（第一版就是漏了 st / car2，读出 64 条假嫌疑）。
 *   2. **锚点必须钉在字面量起点**。第一版用 `boxesGot: 0` 往前找最近的 `{`，
 *      结果找到的是 `boxes:` 那个 `.map(function(){ return { i: i+1 … } })` 的
 *      **内层**字面量 —— 只配平出 4 个键，`pigHP` 被判成"引擎没写过"，
 *      整张名单被污染成 64 条。
 *   3. **`:` 也是写**。`pigHP: 3` 在对象字面量里是赋值，只认 `=` 会漏掉一整类。
 *
 * 白名单（RENDER_OWNED）里的字段是渲染层每帧算完挂到 state 上的表演量，
 * 引擎本来就不该写 —— 每一条都写明理由。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* 去注释（注释里的字样不许当成证据，这是第 54 轮踩过的坑） */
function stripComments(src) {
  let out = '', i = 0, n = src.length, q = null;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\') { out += (d || ''); i += 2; continue; }
      if (c === q) q = null;
      i++; continue;
    }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2);
      out += src.slice(i, e < 0 ? n : e + 2).replace(/[^\n]/g, ' ');
      i = e < 0 ? n : e + 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

const ENGINE = stripComments(fs.readFileSync(path.join(ROOT, 'prototype', 'game.js'), 'utf8'));
const RENDER = stripComments(fs.readFileSync(path.join(ROOT, 'prototype', 'index.html'), 'utf8'));

let pass = 0, fail = 0;
const line = (ok, name, detail) => {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + ' ' + name + (detail ? '　' + detail : ''));
};

/* ---------- 取一段括号配平的对象字面量 ---------- */
function literalAfter(src, decl) {
  const at = src.indexOf(decl);
  if (at < 0) return null;
  const start = src.indexOf('{', at);
  if (start < 0) return null;
  let depth = 0, end = start;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return src.slice(start, end + 1);
}

/* ---------- A. 引擎写入集合 ---------- */
function engineWrites(src) {
  const out = new Set();
  /* a) `state.X =` / `+=` / `-=` / `*=`
   *    `=[^=]` 是为了排除 `==` 比较（写成 `state.X == y` 不是赋值） */
  const re = /\bstate\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:=[^=]|\+=|-=|\*=)/g;
  let m; while ((m = re.exec(src))) out.add(m[1]);
  /* b) `state.X++` / `state.X--` */
  const re2 = /\bstate\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:\+\+|--)/g;
  while ((m = re2.exec(src))) out.add(m[1]);
  /* c) createRun 里 `var state = { … }` 的键（`:` 形式）
   *    锚点必须是字面量起点，不是其中某个元素 —— 见文件头第 2 点。 */
  const stateLit = literalAfter(src, 'var state = {');
  if (stateLit) {
    const kre = /([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
    let km; while ((km = kre.exec(stateLit))) out.add(km[1]);
  }
  /* d) car 上的字段：`car.X =` 与 `var car = { … }` 的键 */
  const cre = /\bcar\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:=[^=]|\+=|-=)/g;
  let cm; while ((cm = cre.exec(src))) out.add('car.' + cm[1]);
  const carLit = literalAfter(src, 'var car = {');
  if (carLit) {
    const kre = /([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
    let km; while ((km = kre.exec(carLit))) out.add('car.' + km[1]);
  }
  return out;
}

/* ---------- B. 渲染层的别名表 + 证据 ---------- */
const ALIAS = [
  { name: 'state.run', re: /\bstate\.run\.([A-Za-z_][A-Za-z0-9_]*)/g, ev: /state\.run\s*=/, car: false },
  { name: 'st', re: /\bst\.([A-Za-z_][A-Za-z0-9_]*)/g, ev: /\bst\s*=\s*state\.run\s*;/, car: false },
  { name: 'car2', re: /\bcar2\.([A-Za-z_][A-Za-z0-9_]*)/g, ev: /\bcar2\s*=\s*state\.run\.car\s*;/, car: true },
  { name: 'car', re: /\bcar\.([A-Za-z_][A-Za-z0-9_]*)/g, ev: /\bcar\s*=\s*state\.run\.car\s*;/, car: true },
];

function renderReads(src) {
  const out = [];
  ALIAS.forEach(a => {
    a.re.lastIndex = 0;
    let m;
    while ((m = a.re.exec(src))) {
      out.push({
        name: (a.car ? 'car.' : '') + m[1],
        line: src.slice(0, m.index).split('\n').length,
        via: a.name,
      });
    }
  });
  return out;
}

/* ---------- C. 白名单：渲染层自己的表演量 ---------- */
const RENDER_OWNED = new Map([
  ['pigMood', '每帧由渲染层按车况算出来的表情，引擎不该知道"表情"这种概念'],
  ['pigShake', '表情配套的抖动开关，纯表演'],
  ['pigEarSwing', '耳朵摆幅 = min(1, 速度/6)，纯表演'],
  /* launchSpec 在 launch() 之后往**运行对象**上挂动作脚本 —— 这是浏览器测试专用入口，
   * 玩家手动玩时永远走不到这里，所以引擎没必要写它。 */
  ['actScript', '标准解的动作时间轴，由 launchSpec（测试/演示入口）在 launch 后挂上去'],
]);

/* ---------- D. 主判定 ---------- */
const W = engineWrites(ENGINE);
const reads = renderReads(RENDER);
const suspects = reads.filter(r => !RENDER_OWNED.has(r.name) && !W.has(r.name));
const uniq = new Map();
suspects.forEach(s => { if (!uniq.has(s.name)) uniq.set(s.name, s); });

console.log('--- D. 渲染层读、引擎从来不写的字段 ---');
if (uniq.size === 0) {
  line(true, '没有"读空"的字段', '全部 ' + new Set(reads.map(r => r.name)).size + ' 个被读的字段引擎都写过');
} else {
  [...uniq.values()].sort((a, b) => a.line - b.line).forEach(s => {
    const src = RENDER.split('\n')[s.line - 1] || '';
    line(false, '读空：' + s.name, 'index.html:' + s.line + ' ← 引擎从未赋值　' + src.trim().slice(0, 90));
  });
}

/* ---------- E. 量具自检（必须能失败，也必须能通过） ---------- */
console.log('--- E. 量具自检 ---');

/* E1. 别名证据：每一条别名都要在源码里找到"它就是 run 状态"的赋值 */
ALIAS.forEach(a => {
  line(a.ev.test(RENDER), '别名成立：' + a.name, String(a.ev));
});

/* E2. `:` 形式也算写。拿 pigHP 验（它在 createRun 的字面量里写的是 `pigHP: 3`）。
 *     漏了它说明字面量配平失败 —— 那整张名单都不作数。 */
line(W.has('pigHP'), '`pigHP: 3`（对象字面量的 `:` 形式）被算成"引擎写过"',
  W.has('pigHP') ? '' : '字面量配平失败，后面的结论作数不了');

/* E3. 名单是活的：给引擎源码副本加一句 `state.lastImpactAt = x`，
 *     它必须立刻从嫌疑名单里消失。
 *     （如果这一步不成立，说明我的"写入集合"根本没被用于判定，
 *      那这个审计永远报同一批东西，等于刻舟求剑。） */
{
  const fake = ENGINE + '\nstate.lastImpactAt = 1;\n';
  const fakeW = engineWrites(fake);
  const stillSuspect = [...uniq.values()].filter(s => s.name === 'lastImpactAt' && !fakeW.has('lastImpactAt'));
  line(fakeW.has('lastImpactAt') && stillSuspect.length === 0,
    '量具能通过：引擎真的写了 lastImpactAt 之后，它不再被报出来',
    fakeW.has('lastImpactAt') ? '已进写入集合' : '没进写入集合');
}

/* E4. 量具能失败：从一个**没有**写 lastBoxAt 的引擎副本里删掉那一句，
 *     它必须重新出现在嫌疑名单。
 *     这一步是"删掉修复、看审计是否报警"的自动化版本 —— 修复自己也要能被量。 */
{
  const broken = ENGINE.replace(/\bstate\.lastBoxAt\s*=\s*state\.time\s*;/g, '');
  line(broken !== ENGINE && !engineWrites(broken).has('lastBoxAt'),
    '量具能失败：把 lastBoxAt 的赋值删掉，审计会重新报它',
    broken === ENGINE ? '替换没命中，这一条无效' : '已删');
  /* 换算成"渲染层那一行会不会变成死读" */
  const renderLine = /state\.run\.lastBoxAt/.test(RENDER);
  line(renderLine, '渲染层确实还在读 lastBoxAt（所以删掉写入就是读空）',
    renderLine ? '' : '渲染层已经不读它了，E4 的前半句失去意义');
}

/* E5. 白名单不是垃圾桶：每条都要写理由，且理由不能是空的 */
{
  const bad = [...RENDER_OWNED.entries()].filter(([, why]) => !why || why.length < 8);
  line(bad.length === 0, '白名单每一条都登记了理由（不是随手放行）',
    bad.map(([k]) => k).join(', ') || RENDER_OWNED.size + ' 条');
}

/* E6. 注释里的字样不许当证据：把 lastImpactAt 的赋值从代码里删掉、
 *     只在注释里保留，审计必须仍然判它为"读空"。 */
{
  const noAssign = ENGINE.replace(/\bstate\.lastImpactAt\s*=\s*now\s*;/g, '') +
    '\n/* 这里提到 state.lastImpactAt = now 不算写入 */\n';
  const stripped = stripComments(noAssign);
  line(!engineWrites(stripped).has('lastImpactAt'),
    '量具能失败：注释里出现 lastImpactAt 不被当成写入',
    engineWrites(stripped).has('lastImpactAt') ? '仍然判成写过' : '已剥离');
}

console.log('\nASSERTS ' + pass + ' / ' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);

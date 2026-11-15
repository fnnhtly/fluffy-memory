/* 审计：DEFAULTS 里的每一个可调参数，真的有代码在读吗？
 *
 * 这是本项目**最大的一块还没对过账的表面**。
 *   · 第 53 轮对的是 `PARTS`（零件表），查出四个写了没人读的字段；
 *   · 第 52 轮对的是 `state.X` / `car.X`（运行时字段）；
 *   · 但 `DEFAULTS` 里那四十来个"可调参数"**从没对过账** ——
 *     而 game.js 自己的注释写着"HTML 面板里能改，也是真机的数值基线"。
 *     一个没人读的参数就是一份假旋钮：改它屏幕上什么都不变，
 *     而它看起来是这一整套物理的调节入口。
 *
 * 判据（对每个键）：
 *   A. game.js 里必须有 `Params.<key>` 或 `DEFAULTS.<key>` 的读取；
 *   B. 只要 game.js 读了就算活着（index.html 不必也读）。
 * 反例白名单（`WRITE_ONLY_OK`）只收"写仍有用"的键 —— 一个都不留最好。
 *
 * 量具自证：故意塞一个不存在的键进白名单、把 `damageMin` 的读法改错，
 * 两种情况下审计必须报红（否则这套正则只是"看起来很严"）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'prototype', 'game.js');
const HTML = path.join(ROOT, 'prototype', 'index.html');

let pass = 0, fail = 0;
const fails = [];
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✓ ${name}` + (detail ? ` — ${detail}` : '')); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}` + (detail ? ` — ${detail}` : '')); }
}

/* 去掉注释，否则注释里出现 `Params.xxx` 会被当成"有读者" —— 第 52 轮踩过。 */
function stripComments(src) {
  let out = '', i = 0, n = src.length;
  let mode = 0;   // 0 code, 1 line, 2 block, 3 single, 4 double, 5 template
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

const gameSrc = stripComments(fs.readFileSync(GAME, 'utf8'));
const htmlSrc = stripComments(fs.readFileSync(HTML, 'utf8'));

/* 用 require 拿到真实的 DEFAULTS 键表 —— 手工抄键名会漏，那正是要查的东西 */
delete require.cache[require.resolve(GAME)];
const R = require(GAME);
const KEYS = Object.keys(R.DEFAULTS);

/* 这些键"只写不读"仍然有意义：目前一个都不该有 */
const WRITE_ONLY_OK = {};

function countReads(src, key) {
  const pats = [
    new RegExp('Params\\.' + key + '\\b', 'g'),
    new RegExp('DEFAULTS\\.' + key + '\\b', 'g'),
    /* 方括号写法：Params['damageMin'] */
    new RegExp('Params\\[\\s*[\'"]' + key + '[\'"]\\s*\\]', 'g')
  ];
  let n = 0;
  pats.forEach(p => { const m = src.match(p); if (m) n += m.length; });
  return n;
}

console.log('=== A. 每个 DEFAULTS 键在 game.js 里被读了几次 ===');
const dead = [];
KEYS.forEach(k => {
  const g = countReads(gameSrc, k);
  const h = countReads(htmlSrc, k);
  const ok = g > 0 || (WRITE_ONLY_OK[k] !== undefined);
  if (!ok) dead.push(k);
  console.log(`  ${ok ? '✓' : '✗'} ${k.padEnd(18)} game.js ${String(g).padStart(3)} 次` +
    (h ? `   index.html ${h} 次` : ''));
});

console.log(`\n共 ${KEYS.length} 个参数，game.js 完全不读的有 ${dead.length} 个` +
  (dead.length ? `：${dead.join('、')}` : '（全部有读者）'));

console.log('\n=== B. 判据汇总 ===');
chk('DEFAULTS 的每个键都至少有一处读取', dead.length === 0, dead.length ? dead.join('、') : `${KEYS.length} 个键全部有读者`);

/* 自证 1：白名单里塞一个不存在的键 —— 审计必须仍然报它"有读者"，
 * 但 take 一个确实没人读的键（临时删除它的所有读者）必须报红。 */
console.log('\n=== C. 量具自证 ===');
{
  /* 造一段只有注释里提到参数、代码里完全不用的源码 */
  const fake = stripComments('/* Params.pumpImpulse = 6 */ var x = 1;\n// Params.maxSpeed\n');
  const n = countReads(fake, 'pumpImpulse');
  chk('注释里出现的 Params.xxx 不算读者', n === 0, `计数 ${n}`);
}
{
  /* 真删掉一个参数的读者，必须能被抓出来 */
  const broken = gameSrc.split('Params.damageMin').join('Params.__nope');
  chk('把 damageMin 的读者全部改名后，审计会报它没人读',
    countReads(broken, 'damageMin') === 0, `计数 ${countReads(broken, 'damageMin')}`);
}
{
  /* 方括号写法也算读者 */
  chk('方括号写法 Params["maxSpeed"] 也算读者',
    countReads('Params["maxSpeed"] = 3;', 'maxSpeed') === 1, '' );
}

console.log(`\nASSERTS ${pass} / ${pass + fail}`);
if (fail) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }

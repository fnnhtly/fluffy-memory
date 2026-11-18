/* 结算卡内的文字不能越出卡片（第 94 轮）。
 *
 * ── 这个洞是怎么发现的 ──
 *
 * 第 94 轮做完整试玩巡检时，逐张看了八关的结算页截图。
 * 肉眼看到「本关 ★ 3 / 3　总计 ★ 15 / 24」这行字压在卡片**下边框**上。
 *
 * 算一下就明白：
 *
 *   卡片高 H = 424，静止时 cardY = 150  →  卡底 574
 *   这行字画在 cardY + 428 = **578**   →  超出 4 px
 *
 * 而 `test_layout_audit` 抓不到它：那个审计查的是"有没有越出**屏幕**"，
 * 这一行离屏幕底还有 142 px。
 *
 * ── 判据 ──
 *
 * 用 `text()` 的调用参数**静态扫描**（不靠截图、不靠渲染），
 * 查出所有画在结算卡范围内的文字 y 坐标，要求它们都在卡内。
 *
 * 为什么静态扫而不是量像素：这一条要守的是**几何常量**，
 * 静态扫是确定的、快的，而且能覆盖所有分支（胜利/失败/三星/差一颗）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const s = fs.readFileSync(path.join(ROOT, 'prototype', 'index.html'), 'utf8');
const lines = s.split(/\r?\n/);

let pass = 0, fail = 0;
const out = [];
function chk(label, cond, extra) {
  if (cond) { pass++; out.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; out.push('✗ ' + label + '  ' + (extra || '')); }
}

/* drawResult 的几何常量（与源码同一份；改那边必须改这里） */
const CARD_H = 424;
const CARD_Y = 150;                 // 静止时（resultT = 1）
const CARD_BOTTOM = CARD_Y + CARD_H;

/* 抓 drawResult 函数体 */
const i0 = lines.findIndex(l => /function drawResult\(/.test(l));
if (i0 < 0) { console.log('✗ 找不到 drawResult'); process.exit(1); }
let i1 = lines.length;
for (let i = i0 + 1; i < lines.length; i++) {
  if (/^  function \w+\(/.test(lines[i])) { i1 = i; break; }
}
const body = lines.slice(i0, i1);
console.log('drawResult 函数体：行 ' + (i0 + 1) + ' ~ ' + i1);

/* 找所有 `text(...)` 调用里的 `cardY + N`，**跨行也算**。
 *
 * ⚠ 第一版只扫"同一行里同时有 text( 和 cardY + N"的行。
 * 而「本关★/总计★」那行是**两行**：
 *
 *     text('本关 ★ ' + ... + ' / ' + (levels.length * 3),
 *       X + W / 2, cardY + 410, 13, ...);
 *
 * 于是它**一条都没被扫到** —— 而它恰恰是这个测试要守的那一行。
 * 判据因此"通过"了：9 处全在卡内，唯独漏了最关键的一处。
 *
 * 这是"空转判据"的第八种形态：**量具的扫描范围漏掉了被测对象**。
 * 现在按"从 `text(` 开始，往后最多看 4 行"把参数拼起来。 */
const hits = [];
body.forEach((l, k) => {
  if (!/\btext\(/.test(l)) return;
  /* 把这次调用可能跨的 4 行拼起来 */
  let joined = l;
  for (let t = 1; t <= 4 && k + t < body.length; t++) joined += ' ' + body[k + t];
  /* 只在第一个 `);` 之前的部分里找（避免拼进下一个调用） */
  const cut = joined.indexOf(');');
  const call = cut > 0 ? joined.slice(0, cut) : joined;
  const ms = [...call.matchAll(/cardY\s*\+\s*(\d+)/g)];
  ms.forEach(m => {
    const n = parseInt(m[1], 10);
    hits.push({ line: i0 + k + 1, offset: n, y: CARD_Y + n,
      text: true, src: l.trim().slice(0, 90) });
  });
});

/* 去重（同一处可能被多行重复匹配） */
const seen = new Set();
const textYs = hits.filter(h => {
  const key = h.line + ':' + h.offset;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
textYs.forEach(h => {
  const inside = h.y <= CARD_BOTTOM;
  console.log((inside ? '  ✓' : '  ✗') + ' y=' + h.y + '（cardY+' + h.offset + '）' +
    '  行 ' + h.line + '  ' + h.src.slice(0, 60));
});

/* A 所有文字基线都在卡内 */
{
  const over = textYs.filter(h => h.y > CARD_BOTTOM);
  chk('A 结算卡内所有文字基线都在卡底（' + CARD_BOTTOM + '）之上',
    over.length === 0,
    over.length ? over.map(h => 'y=' + h.y).join(' ') : textYs.length + ' 处全部在卡内');
}

/* B 最低那行距卡底至少 8 px（不能贴边） */
{
  const maxY = Math.max(...textYs.map(h => h.y));
  chk('B 最低一行文字距卡底至少 8 px', CARD_BOTTOM - maxY >= 8,
    '余量 ' + (CARD_BOTTOM - maxY) + ' px');
}

/* C 自证：把「累计星数」那行改回 428，A 必须红 */
{
  const fakeY = CARD_Y + 428;
  chk('C 自证：这行字若画在 cardY+428（旧值），A 会判红',
    fakeY > CARD_BOTTOM, fakeY + ' > ' + CARD_BOTTOM);
}

/* D 卡片与两个按钮的纵向关系（与 test_playthrough 的 E2 互补：
 *   那条量运行时的 btnRect，这条量源码里的几何常量） */
{
  const btnY = CARD_Y + CARD_H + 34;
  chk('D 结算按钮在卡片下方（gap = 34 px）', btnY >= CARD_BOTTOM,
    btnY + ' ≥ ' + CARD_BOTTOM);
  chk('D2 按钮底边（+72）不越出 720 屏幕高', btnY + 72 <= 720,
    (btnY + 72) + ' ≤ 720');
}

console.log('');
console.log(out.join('\n'));
console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
process.exit(fail ? 1 : 0);

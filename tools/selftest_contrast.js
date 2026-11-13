/* 自检：对比度测量本身准不准？（纯逻辑，不开浏览器）
 *
 * 上一版的问题是"取字形包围盒内的平均色"——小字抗锯齿的边缘像素会把测得的
 * 前景色拉向背景色，导致 195 条文字里有 54 条被判不合格（全是噪声）。
 * 改成"只取差异最大的前 8%、至少 6 个像素"之后降到 16 条，再修文案降到 0 条。
 * 这个用例证明的是：修正后的取样方式能测准，而旧的取样方式测不准。
 */
const assert = require('assert');

const lum = (r, g, b) => {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const L1 = lum(...a), L2 = lum(...b);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
};

// 造一个"字形"：在一张背景图上画 N 个纯前景像素 + M 个半透明抗锯齿像素
function makeBox(bg, fg, coreN, edgeN) {
  const px = [];
  for (let i = 0; i < coreN; i++) px.push({ px: fg.slice(), d: 1e9 });
  for (let i = 0; i < edgeN; i++) {
    const a = 0.35;      // 抗锯齿：前景与背景混一半多
    px.push({ px: [0, 1, 2].map(k => Math.round(fg[k] * a + bg[k] * (1 - a))), d: 0 });
  }
  px.forEach(p => {
    p.d = Math.abs(p.px[0] - bg[0]) + Math.abs(p.px[1] - bg[1]) + Math.abs(p.px[2] - bg[2]);
  });
  return px;
}
function measure_A_all(px, bg) {          // 旧法：全取平均
  let s = [0, 0, 0];
  px.forEach(p => { s[0] += p.px[0]; s[1] += p.px[1]; s[2] += p.px[2]; });
  const n = px.length;
  return ratio(s.map(v => v / n), bg);
}
function measure_B_core(px, bg) {         // 新法：只取差异最大的前 8%
  const sorted = px.slice().sort((a, b) => b.d - a.d);
  const keep = sorted.slice(0, Math.max(6, Math.floor(px.length * 0.08)));
  let s = [0, 0, 0];
  keep.forEach(p => { s[0] += p.px[0]; s[1] += p.px[1]; s[2] += p.px[2]; });
  const n = keep.length;
  return ratio(s.map(v => v / n), bg);
}

let n = 0;
const t = (label, fn) => { fn(); n++; console.log('✓ ' + label); };

const BG = [0, 0, 0];
const FG = [255, 255, 255];

// 1. 纯白压纯黑：理论值 21:1，两种取样都应接近
t('纯白压纯黑 ≈ 21:1', () => {
  const box = makeBox(BG, FG, 40, 0);
  assert.ok(Math.abs(measure_A_all(box, BG) - 21) < 0.05);
  assert.ok(Math.abs(measure_B_core(box, BG) - 21) < 0.05);
});

// 2. 有抗锯齿边缘时，旧法严重低估（这是真 bug）
t('抗锯齿边缘会让旧法低估对比（新法不受影响）', () => {
  const box = makeBox(BG, FG, 20, 60);          // 25% 核心 + 75% 边缘
  const a = measure_A_all(box, BG);
  const b = measure_B_core(box, BG);
  assert.ok(a < 8, '旧法应被边缘拉低到个位数，实际 ' + a.toFixed(2));
  assert.ok(b > 18, '新法应仍接近真实值，实际 ' + b.toFixed(2));
});

// 3. WCAG 临界：4.5 与 3.0 的判定方向必须正确
t('WCAG 阈值判定方向正确', () => {
  // 灰 118 压黑：约 4.85:1（合格）
  const ok = ratio([118, 118, 118], [0, 0, 0]);
  assert.ok(ok > 4.5, '灰118 应合格，实际 ' + ok.toFixed(2));
  // 灰 100 压黑：约 3.6:1（小字不合格、大字合格）
  const mid = ratio([100, 100, 100], [0, 0, 0]);
  assert.ok(mid < 4.5 && mid > 3.0, '灰100 应小字不合格/大字合格，实际 ' + mid.toFixed(2));
});

// 4. 亮字压亮底：必须判为低对比（这正是"白字压天空"的情形）
t('浅灰字压浅底判为低对比', () => {
  const r = ratio([200, 220, 235], [190, 210, 225]);
  assert.ok(r < 1.3, '应低于 1.3，实际 ' + r.toFixed(2));
});

// 5. 反过来（暗字压亮底）也要能算
t('暗字压亮底对比度对称', () => {
  const a = ratio([0, 0, 0], [255, 255, 255]);
  const b = ratio([255, 255, 255], [0, 0, 0]);
  assert.ok(Math.abs(a - b) < 1e-9);
  assert.ok(a > 20);
});

// 6. 没有字形像素（背景色文字）：不能报"合格"
t('与背景同色的文字判为 1:1', () => {
  const box = makeBox(BG, BG, 30, 0);
  assert.ok(measure_A_all(box, BG) < 1.01);
  assert.ok(measure_B_core(box, BG) < 1.01);
});

console.log('\nPASS ' + n + ' / FAIL 0');

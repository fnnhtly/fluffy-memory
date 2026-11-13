/* 审计器自检（纯逻辑，不需要浏览器）
 *
 * 为什么要这个：上一版审计器报告"0 问题"，但它的真实原因是它根本没抓到数据
 * （按帧切片前，两帧文字互相判重叠，全是假阳性；改完之后又要确认不是假阴性）。
 * 所以判定逻辑必须被独立的用例证明：能抓到重叠、能抓到越界、不冤枉正常排版。
 *
 * 采集端由 test_layout_audit.js 的真浏览器跑动证明（build 页 34 条文本、run 页 11 条）。
 */
const assert = require('assert');

// —— 与 test_layout_audit.js 完全一致的判定实现（改动时两边必须同步） ——
function overlapRatio(a, b) {
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ix <= 0 || iy <= 0) return 0;
  return (ix * iy) / Math.min(a.w * a.h, b.w * b.h);
}
function judge(recs, bounds) {
  const B = bounds || { x0: -2, y0: -2, x1: 1282, y1: 722 };
  const rs = recs.filter(r => r.t.trim() && r.w > 1.5);
  const bad = [];
  rs.forEach(r => {
    if (r.x < B.x0 || r.y < B.y0 || r.x + r.w > B.x1 || r.y + r.h > B.y1) {
      bad.push({ kind: '越界', t: r.t });
    }
  });
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      if (overlapRatio(rs[i], rs[j]) > 0.30) bad.push({ kind: '压字', a: rs[i].t, b: rs[j].t });
    }
  }
  return bad;
}

let n = 0;
const t = (label, fn) => { fn(); n++; console.log('✓ ' + label); };

// 1. 正常排版：不该报警
t('正常排版（两行不重叠）判为干净', () => {
  const bad = judge([
    { t: '总重 8.0 kg', x: 96, y: 97, w: 120, h: 14 },
    { t: '零件箱：木框×6', x: 96, y: 136, w: 200, h: 12 }
  ]);
  assert.strictEqual(bad.length, 0, JSON.stringify(bad));
});

// 2. 同一行不同列：不该报警（这是上一版误报最多的情形）
t('同一行左右并排判为干净', () => {
  const bad = judge([
    { t: '用时 12.34 s', x: 300, y: 470, w: 90, h: 16 },
    { t: '木箱 2/3', x: 600, y: 470, w: 70, h: 16 },
    { t: '能量剩 88', x: 940, y: 470, w: 80, h: 16 }
  ]);
  assert.strictEqual(bad.length, 0, JSON.stringify(bad));
});

// 3. 真正压字：必须报警（"出发"压在"零件说明"上，就是这个 bug 的原样）
t('「出发」压住「? 零件说明」被抓到', () => {
  const bad = judge([
    { t: '出发', x: 800, y: 400, w: 44, h: 14 },
    { t: '? 零件说明', x: 806, y: 396, w: 90, h: 13 }
  ]);
  assert.ok(bad.some(b => b.kind === '压字'), JSON.stringify(bad));
});

// 4. 越界：右侧出屏
t('右侧出屏被抓到', () => {
  const bad = judge([{ t: 'SELFTEST-OUT', x: 1250, y: 60, w: 90, h: 20 }]);
  assert.ok(bad.some(b => b.kind === '越界'), JSON.stringify(bad));
});

// 5. 越界：上边界（负数 y）
t('上边界出屏被抓到', () => {
  const bad = judge([{ t: 'NEG', x: 100, y: -9, w: 40, h: 20 }]);
  assert.ok(bad.some(b => b.kind === '越界'), JSON.stringify(bad));
});

// 6. 空白字符串不该参与判定（text() 常被传空串当"占位换行"）
t('空串被忽略', () => {
  const bad = judge([
    { t: '', x: 0, y: 0, w: 0, h: 13 },
    { t: '   ', x: 0, y: 700, w: 12, h: 13 }
  ]);
  assert.strictEqual(bad.length, 0, JSON.stringify(bad));
});

// 7. 完全重合（同一段文字被画两遍）→ 抓得到
t('同一段文字画两遍被抓到', () => {
  const bad = judge([
    { t: '拼装区', x: 400, y: 196, w: 42, h: 12 },
    { t: '拼装区', x: 400, y: 196, w: 42, h: 12 }
  ]);
  assert.ok(bad.some(b => b.kind === '压字'), JSON.stringify(bad));
});

// 8. 轻微擦边（重叠比 < 0.30）不该报 —— 避免噪声淹没真问题
t('轻微擦边不报警', () => {
  const a = { t: 'A', x: 100, y: 100, w: 100, h: 20 };
  const b = { t: 'B', x: 188, y: 100, w: 100, h: 20 };   // 只叠 12/100
  const bad = judge([a, b]);
  assert.strictEqual(bad.length, 0, JSON.stringify(bad));
});

console.log('\nPASS ' + n + ' / FAIL 0');

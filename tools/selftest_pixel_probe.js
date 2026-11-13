/* 自检：像素探针的判据本身准不准？
 *
 * 上一版 test_parts_page.js 用"单个像素色差 > 40"判图标是否存在，
 * 结果把「中空木框」误判成"没画"—— 因为格心本来就是背景色。窗口太窄（7×7）也会漏掉细线。
 * 这里用纯逻辑证明：窗口够大 + 取最大色差，才能区分"中空图元"和"真的没画"。
 */
const assert = require('assert');

// 与 test_parts_page.js 一致的判据
function maxDiff(pix, bg) {
  let dmax = 0;
  for (const q of pix) {
    const d = Math.abs(q[0] - bg[0]) + Math.abs(q[1] - bg[1]) + Math.abs(q[2] - bg[2]);
    if (d > dmax) dmax = d;
  }
  return dmax;
}
const EXISTS = 40;

// 造一块 19×19 的假画布
function blank(bg) {
  const a = [];
  for (let i = 0; i < 19 * 19; i++) a.push([bg[0], bg[1], bg[2]]);
  return a;
}
const at = (x, y) => y * 19 + x;

let n = 0;
const t = (label, fn) => { fn(); n++; console.log('✓ ' + label); };

const BG = [14, 27, 35];

// 1. 中空木框：只有边（半径 7 的一圈），中心空 → 必须判"存在"
t('中空木框（只看得到边）判为已绘制', () => {
  const pix = blank(BG);
  for (let i = 2; i < 17; i++) {
    pix[at(i, 2)] = [196, 152, 92];
    pix[at(i, 16)] = [196, 152, 92];
    pix[at(2, i)] = [196, 152, 92];
    pix[at(16, i)] = [196, 152, 92];
  }
  assert.ok(maxDiff(pix, BG) > EXISTS);
  // 反证：只取正中心那 1 个像素会判成"没画"
  assert.ok(maxDiff([pix[at(9, 9)]], BG) <= EXISTS);
});

// 2. 真的没画：全是背景 → 必须判"不存在"
t('纯背景判为未绘制', () => {
  const pix = blank(BG);
  assert.ok(maxDiff(pix, BG) <= EXISTS);
});

// 3. 细线图元（只有 1px 宽的圆环）→ 窗口够大就该抓到
t('1px 细圆环判为已绘制', () => {
  const pix = blank(BG);
  for (let a = 0; a < 360; a += 4) {
    const r = 7 * Math.PI / 180 * (a / 4 * 4);
    const x = Math.round(9 + Math.cos(r) * 7), y = Math.round(9 + Math.sin(r) * 7);
    if (x >= 0 && x < 19 && y >= 0 && y < 19) pix[at(x, y)] = [220, 200, 150];
  }
  assert.ok(maxDiff(pix, BG) > EXISTS);
});

// 4. 窗口太窄会漏：同样一张图，7×7 中心窗口抓不到中空框的边
t('7×7 窗口会漏判中空图元（说明最大色差 + 大窗口是必需的）', () => {
  const pix = blank(BG);
  for (let i = 2; i < 17; i++) {
    pix[at(i, 2)] = [196, 152, 92];
    pix[at(i, 16)] = [196, 152, 92];
    pix[at(2, i)] = [196, 152, 92];
    pix[at(16, i)] = [196, 152, 92];
  }
  const narrow = [];
  for (let y = 6; y <= 12; y++) for (let x = 6; x <= 12; x++) narrow.push(pix[at(x, y)]);
  assert.ok(maxDiff(narrow, BG) <= EXISTS, '窄窗口本不该抓到，抓到说明测试造的数据不对');
});

// 5. 背景参考色的取样位置决定这把尺子有没有区分力
//    正确（取卡片内空白处）→ 空白画布判"否"、有图元判"是"，能区分
//    错误（取在图元上）  → 连空白画布都会判"是"，失去区分力
t('背景参考点必须来自空白处，否则无法区分"有图元 / 没图元"', () => {
  const withIcon = blank(BG);
  withIcon[at(9, 9)] = [196, 152, 92];
  const noIcon = blank(BG);

  const bgOK = noIcon[at(0, 0)];          // 空白处
  assert.ok(maxDiff(noIcon, bgOK) <= EXISTS, '空白画布应判"无"');
  assert.ok(maxDiff(withIcon, bgOK) > EXISTS, '有图元应判"有"');

  const bgBad = withIcon[at(9, 9)];       // 取样点落在图元上
  assert.ok(maxDiff(withIcon, bgBad) > EXISTS, '图元仍被算出差异（但这不是"检测到了"）');
  assert.ok(maxDiff(noIcon, bgBad) > EXISTS,
    '连没有图元的画布也判"有" —— 说明背景取错位置时这把尺子彻底失效');
});

console.log('\nPASS ' + n + ' / FAIL 0');

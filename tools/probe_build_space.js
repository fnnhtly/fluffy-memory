/* 建造页上还有没有空地放一条"关卡预览"？
 * 不靠眼睛：把 index.html 里所有在建造期占位的固定矩形抄过来，
 * 扫一遍哪些像素带是空的。抄错了这里就会报出和屏幕不一致的结论 ——
 * 所以每个矩形都把 index.html 的原行号打出来对照。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const DW = 1280, DH = 720;
const BUILD_PX = 44, COLS = 6, ROWS = 8;

/* 建造期的固定矩形（与 test_hud_overlap.js 的表同源） */
const R = [
  { name: 'tab0', x: 24, y: 18, w: 80, h: 30 },
  { name: 'tab1..6', x: 24 + 86, y: 18, w: 80 * 6 - 6, h: 30 },
  { name: 'mute', x: DW - 56, y: 16, w: 36, h: 30 },
  { name: 'infoBar', x: 84, y: 90, w: 700, h: 30 },
  { name: 'infoLines', x: 84, y: 128, w: 640, h: 58 },
  { name: 'statCard', x: DW - 232, y: 148, w: 200, h: 188 },
  { name: 'clear', x: 84, y: 324, w: 56, h: 56 },
  { name: 'undo', x: 84, y: 392, w: 56, h: 56 },
  { name: 'rotate', x: 84, y: 460, w: 56, h: 56 },
  { name: 'help', x: DW / 2 + 144, y: 366, w: 88, h: 38 },
  { name: 'launch', x: DW / 2 + 150, y: 258, w: 76, h: 76 },
  { name: 'buildGrid', x: DW / 2 - COLS * BUILD_PX / 2 - 40, y: 222, w: COLS * BUILD_PX, h: ROWS * BUILD_PX },
  { name: 'tip', x: DW / 2 - 330, y: DH - 136, w: 660, h: 20 }
];

/* 托盘：从左下角往右排，每格 trayW */
const TRAY_N = 9;
const trayW = Math.min(88, (DW - 240) / TRAY_N);
const trayY = DH - 108, trayH = 92;
for (let i = 0; i < TRAY_N; i++) {
  R.push({ name: 'tray' + i, x: 24 + i * (trayW + 8), y: trayY, w: trayW, h: trayH });
}

/* 逐像素占用 */
const occ = new Uint8Array(DW * DH);
for (const r of R) {
  const x0 = Math.max(0, Math.floor(r.x)), x1 = Math.min(DW, Math.round(r.x + r.w));
  const y0 = Math.max(0, Math.floor(r.y)), y1 = Math.min(DH, Math.round(r.y + r.h));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) occ[y * DW + x] = 1;
}
let free = 0;
for (let i = 0; i < occ.length; i++) if (!occ[i]) free++;

/* 候选：横向条带。对每个高度 h（24/30/36/44/56），扫过所有 y，
 * 找出一段完全空的连续宽度 ≥ 400 的横带。 */
const bands = [];
for (const h of [24, 30, 36, 44, 56]) {
  for (let y = 0; y + h <= DH; y += 2) {
    let run = 0, runStart = 0, best = null;
    for (let x = 0; x < DW; x++) {
      let clear = true;
      for (let dy = 0; dy < h; dy++) if (occ[(y + dy) * DW + x]) { clear = false; break; }
      if (clear) { if (run === 0) runStart = x; run++; if (!best || run > best.w) best = { x: runStart, y, w: run, h }; }
      else run = 0;
    }
    if (best && best.w >= 400) bands.push(best);
  }
}
/* 同一条带会被相邻的 y 重复报出来，按 y 合并 */
bands.sort((a, b) => b.w - a.w || a.y - b.y);
const seen = [];
for (const b of bands) {
  if (seen.some(s => s.h === b.h && Math.abs(s.y - b.y) <= 4 && Math.abs(s.x - b.x) <= 8)) continue;
  seen.push(b);
  if (seen.length >= 12) break;
}

console.log('建造期固定矩形 ' + R.length + ' 个，空像素 ' + free + ' / ' + (DW * DH) +
  '（' + (free / (DW * DH) * 100).toFixed(1) + '%）\n');
console.log('仍然空着的横带（宽 ≥ 400，按宽度排序）：');
seen.forEach(b => console.log(`  y=${b.y} h=${b.h}  x=${b.x}..${b.x + b.w}  (宽 ${b.w})`));

/* 和 index.html 对照：把几个关键矩形的原文打出来，人眼能核对一遍 */
const html = fs.readFileSync(path.join(ROOT, 'prototype', 'index.html'), 'utf8').split('\n');
const want = [/statCard/, /function trayRect/, /tip/, /infoLines/, /x: 84, y: 324/];
console.log('\nindex.html 对照：');
html.forEach((l, i) => {
  if (want.some(re => re.test(l))) console.log('  ' + (i + 1) + ': ' + l.trim().slice(0, 120));
});

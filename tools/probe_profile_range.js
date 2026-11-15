/* 关卡地形剖面到底有多高？ —— 决定"预览条"用固定竖向比例能不能装下。
 *
 * 起因：buildCam 只看得见 start 附近 ±9.5 米（probe_build_view.js 量的），
 * 六关的终点**全都在屏幕外**。玩家在拼装页看不见要去的坡。
 * 想补一条横贯全关的地形剖面，但先得知道竖向要留多少像素。
 *
 * 这里只回答几件事，不做设计：
 *   1. 每关整条地表 surfaceY 的 min / max / 落差；
 *   2. 只看「起点→终点」这段的落差（玩家真正要翻的那段）；
 *   3. 相邻列的最大坡度（陡坡宁可画成陡的，也别压平）；
 *   4. 固定竖向比例（一条高度、所有关共用一个 px/m）会把这六关画成什么样。
 */
const R = require('../prototype/game.js');
const levels = require('../prototype/levels.js');

const rows = [];
console.log('关卡     列数  全剖面 min..max   落差   起点→终点落差   最陡坡度  终点列  木箱列');
for (const lv of levels) {
  const ter = R.makeTerrain(lv);
  let mn = Infinity, mx = -Infinity, steep = 0;
  for (let c = 0; c < lv.grid.cols; c++) {
    const y = ter.surfaceY(c);
    if (y < mn) mn = y;
    if (y > mx) mx = y;
  }
  for (let c = 0; c + 1 < lv.grid.cols; c++) {
    steep = Math.max(steep, Math.abs(ter.surfaceY(c + 1) - ter.surfaceY(c)));
  }
  const startY = ter.surfaceY(lv.start.col);
  const goalY = ter.surfaceY(lv.goal.col);
  const segRelief = Math.abs(goalY - startY);
  const r = { lv, cols: lv.grid.cols, mn, mx, span: mx - mn, segRelief, steep,
    start: lv.start.col, goal: lv.goal.col, boxes: (lv.boxes || []).map(b => b.col) };
  rows.push(r);
  console.log(
    lv.levelId.padEnd(8) + String(lv.grid.cols).padStart(4) +
    ('  ' + mn.toFixed(2) + '..' + mx.toFixed(2)).padEnd(18) +
    (mx - mn).toFixed(2).padStart(6) +
    segRelief.toFixed(2).padStart(15) +
    steep.toFixed(2).padStart(11) +
    String(lv.goal.col).padStart(8) + '  ' + JSON.stringify(r.boxes));
}

const maxSpan = Math.max(...rows.map(r => r.span));
const maxSeg = Math.max(...rows.map(r => r.segRelief));
console.log('\n全剖面最大落差 ' + maxSpan.toFixed(2) + ' 米（' +
  rows.find(r => r.span === maxSpan).lv.levelId + '）');
console.log('起点→终点最大落差 ' + maxSeg.toFixed(2) + ' 米（' +
  rows.find(r => r.segRelief === maxSeg).lv.levelId + '）');

/* 固定竖向比例：所有关共用一条"px per 米"，不做每关自适应。
 * 自适应会让 1-3（几乎平）看起来和 1-6（十米落差）一样险，
 * 那种"每关都画满"的预览是在骗玩家 —— 所以宁可让 1-3 接近一条直线。 */
console.log('\n固定竖向比例（统一 px/m，共用一个 pxPerM）：');
for (const H of [30, 36, 42]) {
  const pxm = H / maxSpan;
  const parts = rows.map(r => r.lv.levelId + ' ' + (r.span * pxm).toFixed(0) + 'px').join('  ');
  console.log('  条高 ' + H + 'px → ' + pxm.toFixed(2) + ' px/m　实际起伏：' + parts);
}

/* 横向：条宽固定，按列铺满 —— 每关每列多少像素差很多（1-3 是 66 列） */
const W = 956;
console.log('\n横向 ' + W + 'px：');
const pxm36 = 36 / maxSpan;
rows.forEach(r => {
  console.log('  ' + r.lv.levelId + '  每列 ' + (W / r.cols).toFixed(2) + ' px' +
    '，最陡处相邻列抬 ' + (r.steep * pxm36).toFixed(2) + ' px' +
    '，起点 → 终点占 ' + ((r.goal - r.start) / (r.cols - 1) * W).toFixed(0) + ' px');
});

/* 竖向台阶在哪？"预览条"如果只画 start→goal 这段，台阶必须落在窗口里，
 * 否则最该被看见的地形（1-6 那道十米坎）会被裁掉。 */
console.log('\n竖向台阶（相邻列落差 > 1.5 米）落点：');
rows.forEach(r => {
  const ter = R.makeTerrain(r.lv);
  const steps = [];
  for (let c = 0; c + 1 < r.cols; c++) {
    const d = ter.surfaceY(c + 1) - ter.surfaceY(c);
    if (Math.abs(d) > 1.5) steps.push({ c: c + 1, d: +d.toFixed(2) });
  }
  const inWin = steps.filter(s2 => s2.c >= r.start && s2.c <= r.goal + 2);
  console.log('  ' + r.lv.levelId + '  全部 ' + JSON.stringify(steps.slice(0, 6)) +
    (steps.length > 6 ? '…共' + steps.length : '') +
    '　start..goal 窗口内 ' + inWin.length + ' 个' + (inWin.length ? ' ' + JSON.stringify(inWin) : ''));
});

/* 裁剪窗口：只画 start..goal+2 时，每关占多少列、每列多少像素 */
const WW = 1232;
console.log('\n裁剪到 [start, goal+2] 后（条宽 ' + WW + 'px）：');
rows.forEach(r => {
  const n = r.goal + 2 - r.start + 1;
  console.log('  ' + r.lv.levelId + '  窗口 ' + r.start + '..' + (r.goal + 2) + ' 共 ' + n + ' 列，每列 ' +
    (WW / n).toFixed(1) + ' px，终点落在 ' + ((r.goal - r.start) / (n - 1) * 100).toFixed(0) + '% 处');
});

console.log('\n起点/终点在条上的横向比例（0..1，按 col/(cols-1)）：');
rows.forEach(r => {
  const boxFrac = r.boxes.map(c => Number((c / (r.cols - 1)).toFixed(3)));
  console.log('  ' + r.lv.levelId + '  start ' + (r.start / (r.cols - 1)).toFixed(3) +
    '  goal ' + (r.goal / (r.cols - 1)).toFixed(3) +
    '  木箱 ' + JSON.stringify(boxFrac));
});

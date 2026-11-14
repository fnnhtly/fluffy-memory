/* 生成 levels/06.json —— 1-6「抬个头」。
 *
 * 剖面（见 tools/tune_1_6_wall.js 的 build）：
 *   c0..c11   助跑面（y≈5.8），出生就在下坡上
 *   c12       1 格沟（hardCols 关掉平滑 → 真垂直立面）
 *   c13..c22  高台（y≈9.2，比助跑面高 3.33 米）
 *   终点      墙角 +2 格（c15）
 *
 * 为什么是"1 格沟 + 3.3 米墙"而不是"8 格长沟"：
 *   气球上升定速 2.5 m/s，横速只有 ~1.8 m/s → 空中轨迹斜率约 1.4 : 1。
 *   跨 8 格沟要升 10 米（车飘出画面、窗口塌到 0.1 秒）；
 *   爬 3.3 米墙只要升 2.4 秒、横移 3 米，窗口 ±0.8 秒。
 *   而垂直立面又是"不升空绝对过不去"的硬保证（轮子半径 0.34 米）。
 */
const fs = require('fs');
const path = require('path');
const T = require('./tune_1_6_wall.js');

const CFG = { gapW: 1, wallUp: 4, runup: 11, platW: 10, goalOff: 2 };
const lv = T.build(CFG);
/* 木箱放在终点 +3 格：标准解落地后还要往前滚 3 米才吃到它。
 * 放在 +2 会变成"随便扎都吃得到"、放在 +4 又要求扎得极准，
 * 实测 +3 的三星窗口是 扎@8.0–9.75 共 8 个采样点（见 tools/stars_1_6.js）。 */
lv.boxes = [{ col: lv.goal.col + 3, row: lv.goal.row }];

const out = {
  levelId: '1-6',
  name: '抬个头',
  chapter: 1,
  biome: 'dusk',
  note: '沙袋压住跑下坡 → 崖口扔沙袋升起来 → 爬上高台 → 扎一个气球稳稳落下去。',
  grid: lv.grid,
  buildArea: lv.buildArea,
  start: lv.start,
  goal: lv.goal,
  hardCols: lv.hardCols,
  physics: lv.physics,
  partsBox: lv.partsBox,
  mapRows: lv.mapRows,
  materials: lv.materials,
  boxes: lv.boxes,
  challenge: { type: 'allSandbags' },
  timeLimit: 120
};

const rows = out.mapRows.map(s => s.split(''));
function put(r, c, ch) {
  if (r < 0 || r >= rows.length || c < 0 || c >= rows[0].length) throw new Error('marker oob ' + r + ',' + c);
  if (rows[r][c] === '#') throw new Error('marker 落在实体里 ' + r + ',' + c);
  rows[r][c] = ch;
}
put(out.start.row, out.start.col, 'S');
out.boxes.forEach(b => put(b.row, b.col, 'B'));
put(out.goal.row, out.goal.col, 'E');
out.mapRows = rows.map(r => r.join(''));
out.mapRows.forEach((s, i) => { if (s.length !== out.grid.cols) throw new Error('row ' + i + ' len ' + s.length); });

fs.writeFileSync(path.join(__dirname, '..', 'levels', '06.json'), JSON.stringify(out, null, 1) + '\n', 'utf8');
console.log('levels/06.json written');
console.log(out.mapRows.map((s, i) => String(i).padStart(2) + ' ' + s.slice(0, 30)).join('\n'));

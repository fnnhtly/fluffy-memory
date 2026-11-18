/* 把 1-6 的坡放缓（第 86 轮，第二版 —— 上一版算错了行号）。
 *
 * ── 上一版错在哪 ──
 *
 * 第一版用 `row = H-1-round(y)` 把高度换算成行号。但 `makeTerrain` 的
 * 约定是 `高度 = rows - topRow`，也就是 `topRow = rows - 高度`。
 * 我多减了 1，于是**整张地图抬高了一米**：
 *
 *   旧 surfaceY(0..8) = 4.000 4.000 3.999 3.995 3.990 3.960 3.883 3.731 3.174
 *   新 surfaceY(0..8) = 5.000 5.000 5.000 5.000 5.000 5.000 5.000 5.000 5.000
 *
 * 起点区被填平了，车的位置变了，`test_parts_connected` 的
 * propeller ↔ 木框接缝量到 15%（以前 100%）。
 *
 * 那一红不是"零件没连上"，是**地形被改坏了**。
 *
 * ── 这一版 ──
 *
 * 行号换算改成 `topRow = H - round(y)`，并且**保留 S / E / B 标记**
 * （它们是起点、终点、木箱的位置，`makeTerrain` 不把它们当实体，
 * 但别的工具会读）。
 *
 * 坡度：col 16 起每列升 0.5 米（26.5°）。原来 col 15→18 是
 * 41° / 47° / 52° / 56°，车以 6.5 m/s 冲上去前轮撞坡面，
 * 够到 damageMin=4.5 掉一点耐久。
 */
const fs = require('fs');
const P = 'levels/06.json';
const j = JSON.parse(fs.readFileSync(P, 'utf8'));

/* 从旧地图里找回 S / E / B 的列（它们的行由新地形决定） */
const oldRows = j.mapRows.slice();
const marks = [];
for (let r = 0; r < oldRows.length; r++) {
  for (let c = 0; c < oldRows[r].length; c++) {
    const ch = oldRows[r][c];
    if (ch === 'S' || ch === 'E' || ch === 'B') marks.push({ ch, c });
  }
}
const startCol = (marks.filter(m => m.ch === 'S')[0] || {}).c;
const endCol = (marks.filter(m => m.ch === 'E')[0] || {}).c;
const boxCols = marks.filter(m => m.ch === 'B').map(m => m.c);
console.log('旧地图标记：S@' + startCol + '  E@' + endCol + '  B@' + boxCols.join(','));

const H = oldRows.length;
const COLS = j.grid.cols;

/* 地面高度：col 0..15 缓下坡（4.00 → 3.95），col 16 起每列升 0.5 米到 +6 后平 */
function terrainH(c) {
  if (c <= 15) return 4.00 - 0.05 * c / 15;
  return 3.95 + Math.min(6, (c - 15) * 0.5);
}

/* 行 / 列 → 高度（makeTerrain 的约定：高度 = rows - topRow，所以 topRow = rows - 高度） */
function surfaceYOf(c) { return terrainH(c); }
function topRowOf(c) { return H - Math.round(surfaceYOf(c)); }

const newRows = [];
for (let r = 0; r < H; r++) {
  let s = '';
  for (let c = 0; c < COLS; c++) {
    const top = topRowOf(c);
    s += (r >= top ? '#' : '.');
  }
  newRows.push(s);
}

/* 把标记贴回地表那一行 */
function putMark(ch, c) {
  const top = topRowOf(c);
  const row = newRows[top];
  newRows[top] = row.slice(0, c) + ch + row.slice(c + 1);
}
if (startCol !== undefined) putMark('S', startCol);
if (endCol !== undefined) putMark('E', endCol);
boxCols.forEach(c => putMark('B', c));

j.mapRows = newRows;
j.goal = { col: 22 };      /* 终点挪到坡上（col 15 → 22） */
fs.writeFileSync(P, JSON.stringify(j, null, 1) + '\n', 'utf8');
console.log('1-6 地形已放缓坡，终点 col 15 → 22');

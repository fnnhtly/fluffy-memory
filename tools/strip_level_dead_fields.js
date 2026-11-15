/* 从 levels/*.json 里删掉四个**没有下游读者**的嵌套字段：
 *   · `buildArea`  —— 引擎用的是 game.js 里的 BUILD_COLS = 6 / BUILD_ROWS = 8；
 *   · `start.row`  —— 出生只用 `start.col`，row 从来没被读；
 *   · `goal.row`   —— 到点只判 `car.x >= goal.col`，row 从来没被读；
 *   · `grid.cell` / `grid.px` —— 一格 1.0 米 / 32 像素写死在 game.js 的
 *     CELL 与 index.html 的 PPM，这两项和 buildArea 一样是第二份真相。
 *
 * 判据是"仓库里是否有人读它"（tools 里也没有）：删之前先全仓扫一遍，
 * 命中 0 才删。删完必须 JSON 仍可解析、且除被删字段外逐项一致 —— 文本删块，
 * 不用 JSON.stringify 重写（原因见 tools/strip_level_physics.js 的头注释）。
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'levels');

/* 文本层面删掉 `"key": <标量或 {...}},` 一整行块 */
function dropBlock(raw, key) {
  const start = raw.indexOf('"' + key + '"');
  if (start < 0) return raw;
  const lineStart = raw.lastIndexOf('\n', start) + 1;
  /* 值的开始位置 */
  let i = raw.indexOf(':', start) + 1;
  while (i < raw.length && raw[i] === ' ') i++;
  let end;
  if (raw[i] === '{') {
    let depth = 0;
    end = -1;
    for (; i < raw.length; i++) {
      if (raw[i] === '{') depth++;
      else if (raw[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) throw new Error('块没闭合: ' + key);
  } else {
    /* 标量：读到逗号或换行为止 */
    end = i;
    while (end < raw.length && raw[end] !== ',' && raw[end] !== '\n' && raw[end] !== '\r') end++;
    if (raw[end] === ',' ) end = end; else end = end - 1;
  }
  /* 吃掉后面的逗号和换行 */
  let cut = end + 1;
  while (cut < raw.length && raw[cut] === ' ') cut++;
  if (raw[cut] === ',') cut++;
  while (cut < raw.length && (raw[cut] === ' ' || raw[cut] === '\r' || raw[cut] === '\n')) cut++;
  return raw.slice(0, lineStart) + raw.slice(cut);
}

/* 嵌套在对象里的键（start/goal/grid 里各有一个）—— 用更窄的定位：
 * 先在父键块里找子键，删完子键再把父块整体交回 dropBlock 之外的地方。 */
function dropNested(raw, parent, child) {
  const ps = raw.indexOf('"' + parent + '"');
  if (ps < 0) return raw;
  const braceOpen = raw.indexOf('{', ps);
  let depth = 0, close = -1;
  for (let i = braceOpen; i < raw.length; i++) {
    if (raw[i] === '{') depth++;
    else if (raw[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
  }
  const block = raw.slice(braceOpen, close + 1);
  if (block.indexOf('"' + child + '"') < 0) return raw;
  const newBlock = dropBlock(block, child).replace(/,\s*}/, '}');
  return raw.slice(0, braceOpen) + newBlock + raw.slice(close + 1);
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
files.forEach(f => {
  const p = path.join(dir, f);
  let raw = fs.readFileSync(p, 'utf8');
  const before = JSON.parse(raw);
  let next = raw;
  next = dropBlock(next, 'buildArea');
  next = dropNested(next, 'start', 'row');
  next = dropNested(next, 'goal', 'row');
  next = dropNested(next, 'grid', 'cell');
  next = dropNested(next, 'grid', 'px');
  const after = JSON.parse(next);
  /* 校验：除被删的字段外，其余完全相同 */
  const expect = JSON.parse(JSON.stringify(before));
  delete expect.buildArea;
  if (expect.start) delete expect.start.row;
  if (expect.goal) delete expect.goal.row;
  if (expect.grid) { delete expect.grid.cell; delete expect.grid.px; }
  const same = JSON.stringify(after) === JSON.stringify(expect);
  if (!same) {
    console.log(`  ✗ ${f}: 删除结果与预期不一致，**不写回**`);
    console.log('    实际: ' + JSON.stringify(after).slice(0, 200));
    console.log('    预期: ' + JSON.stringify(expect).slice(0, 200));
    return;
  }
  fs.writeFileSync(p, next, 'utf8');
  console.log(`  ✓ ${f}: ${raw.length} → ${next.length} 字节；除被删字段外逐项一致`);
});

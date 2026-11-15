/* 从 levels/*.json 的 materials 里删掉 `surfaceRow`。
 *
 * 量过才删（tools/_chk_surface_row.js）：9 段材质声明里 **6 段说的是假话** ——
 *   1-1 mud cols[0,39]  声明 8，实际 [5,6,7,8]   （地形是从 col5 一路抬到 col8 的缓坡）
 *   1-4 ice cols[0,40]  声明 8，实际 [8,7,6,5]   （冰面台地本身就是抬高的）
 *   1-6 mud cols[0,11]  声明 12，实际 [9,10,11,12]（崖前那段是台阶）
 * 而引擎里每列地表行是从 `mapRows` 数出来的（第一个实体字符所在行），这个字段没人读。
 * 一句没人读、而且三分之二场合说错的数字，不是"备忘"，是**主动骗人的文档**：
 * 以后谁按它改地形都会撞墙。所以删掉，让 `mapRows` 保持唯一真相。
 *
 * 文本删块，不重新格式化（原因见 tools/strip_level_physics.js 的头注释）。
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'levels');

const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
let segs = 0;
files.forEach(f => {
  const p = path.join(dir, f);
  let raw = fs.readFileSync(p, 'utf8');
  const before = JSON.parse(raw);
  /* `"surfaceRow": N,` 或 `"surfaceRow": N`（后者出现在行尾） */
  const re = /"surfaceRow":\s*[0-9]+,\s*/g;
  const n = (raw.match(re) || []).length;
  const next = raw.replace(/,\s*"surfaceRow":\s*[0-9]+\s*}/g, '}')
    .replace(/,\s*"surfaceRow":\s*[0-9]+,/g, ',')
    .replace(/"surfaceRow":\s*[0-9]+,\s*/g, '');
  const after = JSON.parse(next);
  /* 逐段核对：除了 surfaceRow，别的键一个都不能变 */
  const exp = JSON.parse(JSON.stringify(before));
  (exp.materials || []).forEach(m => delete m.surfaceRow);
  const same = JSON.stringify(after) === JSON.stringify(exp);
  if (!same) {
    console.log(`  ✗ ${f}: 结果与预期不一致，**不写回**`);
    console.log('    实际 materials: ' + JSON.stringify(after.materials));
    console.log('    预期 materials: ' + JSON.stringify(exp.materials));
    return;
  }
  fs.writeFileSync(p, next, 'utf8');
  segs += n;
  console.log(`  ✓ ${f}: ${raw.length} → ${next.length} 字节，删掉 ${n} 处 surfaceRow，材质类型/列区间未变`);
});
console.log(`\n共删 ${segs} 处。必须重跑 tools/build_levels_js.js。`);

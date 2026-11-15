/* 删掉 levels/*.json 里最后两个"有人写、没人读"的字段：
 *   · `chapter` —— 六关全是 1，而 `chapterDone()` 判的是"六关都到过终点"，
 *                  从来没读过这个数字。它是一份**没有读者的分章概念**；
 *   · `note`    —— 只有 1-6 有，是**给设计者看的标准解说明**，不是玩家文案。
 *                  它会出现在关卡数据里，但没有任何界面画过它
 *                  （横幅只念 boxes / 终点 / 气球 / 沙袋，卡片只念 name 与 partsBox）。
 *
 * 这两样的共同点：看上去像"数据驱动的入口"，实际改了没有任何效果。
 * `note` 的内容移到 docs 里（设计意图本来该在文档，不在关卡数据）。
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'levels');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();

/* 删掉形如  "key": "...",\n 或 "key": N,\n 的一整行（值可以是字符串或标量） */
function dropLine(raw, key) {
  const re = new RegExp('^[ \\t]*"' + key + '":\\s*(?:"(?:[^"\\\\]|\\\\.)*"|-?[0-9.]+)\\s*,\\r?\\n', 'm');
  if (!re.test(raw)) {
    /* 也允许它是最后一个字段（后面没有逗号） */
    const re2 = new RegExp('^[ \\t]*"' + key + '":\\s*(?:"(?:[^"\\\\]|\\\\.)*"|-?[0-9.]+)\\s*\\r?\\n', 'm');
    if (!re2.test(raw)) return raw;
    return raw.replace(re2, '').replace(/,\s*(\r?\n\s*})/, '$1');
  }
  return raw.replace(re, '');
}

files.forEach(f => {
  const p = path.join(dir, f);
  let raw = fs.readFileSync(p, 'utf8');
  const before = JSON.parse(raw);
  let next = dropLine(raw, 'chapter');
  next = dropLine(next, 'note');
  /* 如果删完留下了 `"grid": {...},` 后面紧跟 `}` 的悬空逗号，清一下 */
  next = next.replace(/,\r?\n(\s*})/g, '\n$1');
  let after;
  try { after = JSON.parse(next); } catch (e) {
    console.log(`  ✗ ${f}: 删完 JSON 坏了（${e.message}），**不写回**`);
    return;
  }
  const exp = JSON.parse(JSON.stringify(before));
  delete exp.chapter; delete exp.note;
  if (JSON.stringify(after) !== JSON.stringify(exp)) {
    console.log(`  ✗ ${f}: 除 chapter/note 外还有差异，**不写回**`);
    console.log('    实际 keys: ' + Object.keys(after).join(' '));
    console.log('    预期 keys: ' + Object.keys(exp).join(' '));
    return;
  }
  fs.writeFileSync(p, next, 'utf8');
  console.log(`  ✓ ${f}: ${raw.length} → ${next.length} 字节；keys = ${Object.keys(after).join(' ')}`);
});
console.log('\n必须重跑 tools/build_levels_js.js。');

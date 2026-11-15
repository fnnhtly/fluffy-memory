/* 从 levels/*.json 里删掉 `physics` 字段 —— **纯文本删块**，不重新格式化。
 *
 * 为什么要删：`levels/*.json` 六关都写着
 *     "physics": { "gravity": 16.0, "stepHz": 60, "subSteps": 4,
 *                  "friction": { "mud": 0.6, "stone": 0.45, "ice": 0.05 } }
 * 而引擎里这套数字**没有一个是从这里读的**：
 *   · 重力/子步 → `Params.gravity` / `Params.subSteps`（DEFAULTS）；
 *   · 地表摩擦 → `ter.frictionAt(x)` 里写死的 0.05 / 0.45 / 0.6。
 * 于是这四行是**第四张假旋钮表**（前三张：PARTS / state.X / DEFAULTS）。
 * 它的危害和前面几张一样：看着像"这一关的重力"，改了没有任何效果。
 *
 * 为什么不把它做成活的：六关的重力/子步/摩擦**本来就全部相同**，
 * 做成活字段等于给一份没有差异的数据开一个入口 —— 那不是能力，是噪音。
 * `Params` 才是唯一的那张表（HTML 调参面板拧的就是它）。
 * 以后真需要"这关重力不一样"，再连同 `Params` 的作用域一起设计。
 *
 * 为什么不用 JSON.stringify 重写：六份文件里有五份的缩进/换行和
 * `JSON.stringify(obj, null, 1)` 不一致（见 tools/_chk_json_roundtrip.js），
 * 重写会把整份文件都算成改动，以后谁也看不出哪一行是真的改过。
 * 所以这里按文本删块，并断言"删完之后 JSON 仍然能解析、且除 physics 外逐字节一致"。
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'levels');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
let changed = 0;

files.forEach(f => {
  const p = path.join(dir, f);
  const raw = fs.readFileSync(p, 'utf8');
  const before = JSON.parse(raw);
  if (!before.physics) { console.log(`  ${f}: 没有 physics，跳过`); return; }

  /* 匹配 `"physics": { ... },` 整块（含后面那个逗号），括号要配平 */
  const start = raw.indexOf('"physics"');
  if (start < 0) throw new Error(f + ': 找不到 physics');
  /* 从 "physics" 往后找第一个 '{'，然后配平到它的 '}' */
  const braceOpen = raw.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = braceOpen; i < raw.length; i++) {
    if (raw[i] === '{') depth++;
    else if (raw[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error(f + ': physics 块没闭合');

  /* 删到行尾（把 trailing 的 ',' 和换行一起吃掉，保持前后两行的节奏） */
  let cut = end + 1;
  while (cut < raw.length && (raw[cut] === ' ' || raw[cut] === ',' )) cut++;
  if (raw[cut] === '\r') cut++;
  if (raw[cut] === '\n') cut++;
  /* 前面若有缩进残留，把 physics 所在行整行删掉 */
  let lineStart = raw.lastIndexOf('\n', start) + 1;
  const next = raw.slice(0, lineStart) + raw.slice(cut);

  const after = JSON.parse(next);
  delete before.physics;
  const same = JSON.stringify(after) === JSON.stringify(before);
  if (!same) throw new Error(f + ': 删完之后除 physics 外还有别的差异');

  fs.writeFileSync(p, next, 'utf8');
  changed++;
  console.log(`  ${f}: 删掉 physics（${raw.length} → ${next.length} 字节），其余字段逐项一致`);
});

console.log(`\n共改 ${changed} 份。接下来必须重跑 tools/build_levels_js.js 重新生成 prototype/levels.js。`);

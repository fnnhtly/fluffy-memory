/*第 11 轮 A：渲染自检工具 —— 防"改了没生效"

思路：改渲染代码后，截图必须真的变化。这个工具：
1. 记录每张截图的内容哈希
2. 对比"同一张图在改动前后"是否一致
3. 若一致 → 警告"你的改动可能没生效"

用法：
  node tools/shot_diff.js snapshot <tag>     # 记录当前所有验证截图的哈希
  ...改代码，重新生成截图...
  node tools/shot_diff.js compare <tag>      # 对比哪些图没变化
*/

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'records', 'shots');
const STATE = path.join(ROOT, 'records', 'shot-hashes.json');

// 参与"应随渲染变化"的截图（不含交互测试的过程图）
// 只放"每次渲染改动都应该变化"的图。
// 注意：ls-04-thumb.png 是选关页，不含车辆零件，改动零件外观时它不会变，
// 所以从 WATCH 移除（避免误报"改动没生效"）。
const WATCH = [
  'biome-1-field.png', 'biome-2-canyon.png', 'biome-3-cave.png',
  'biome-4-ice.png', 'biome-5-dusk.png',
  'rs-01-result.png', 'im-01-impact.png'
];

function hashFile(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
}

function collect() {
  const out = {};
  for (const name of WATCH) {
    const p = path.join(SHOTS, name);
    if (fs.existsSync(p)) out[name] = hashFile(p);
  }
  return out;
}

const action = process.argv[2];
const tag = process.argv[3] || 'default';

if (action === 'snapshot') {
  const cur = collect();
  let all = {};
  if (fs.existsSync(STATE)) {
    try { all = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { all = {}; }
  }
  all[tag] = cur;
  fs.writeFileSync(STATE, JSON.stringify(all, null, 2), 'utf8');
  console.log(`snapshot "${tag}": ${Object.keys(cur).length} 张图`);
  for (const [k, v] of Object.entries(cur)) console.log(`  ${k}  ${v}`);
} else if (action === 'compare') {
  if (!fs.existsSync(STATE)) { console.log('没有基线，先 snapshot'); process.exit(1); }
  const all = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const base = all[tag];
  if (!base) { console.log(`没有 "${tag}" 的基线`); process.exit(1); }
  const cur = collect();
  let same = 0, diff = 0, missing = 0;
  console.log(`对比基线 "${tag}"：`);
  for (const name of WATCH) {
    if (!(name in base) || !(name in cur)) { missing++; continue; }
    if (base[name] === cur[name]) { same++; console.log(`  ⚠ 未变化: ${name}  (${cur[name]})`); }
    else { diff++; console.log(`  ✓ 已变化: ${name}`); }
  }
  console.log(`\n变化 ${diff} / 未变 ${same} / 缺失 ${missing}`);
  if (same > 0) {
    console.log('\n注意：未变化的图片说明对应的渲染改动可能没生效（或你只改了别处）。');
  }
  process.exit(same > 0 ? 2 : 0);
} else {
  console.log('用法：node tools/shot_diff.js snapshot|compare [tag]');
}

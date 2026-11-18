/* 反向验证 test_level_variety.js（第 96 轮）。
 *
 * 判据守的是"八关长得像八个地方"。要拆的是**配色**：
 *   把某两关的 biome 改成同一套 → A/B/C/D 里至少一条必须红。
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const P = 'prototype/index.html';
const raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
const orig = crlf ? raw.split('\r\n').join('\n') : raw;
const toDisk = s => (crlf ? s.split('\n').join('\r\n') : s);

function run() {
  let out = '';
  try {
    out = execFileSync('node', ['tools/test_level_variety.js'],
      { encoding: 'utf8', timeout: 900000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗'))
  };
}

/* 把 gorge（1-7）的配色整段换成 canyon（1-2）的 —— 两关就一样了。
 * 这是最直接的一刀：它模拟"有人复制了一套配色忘了改"。 */
const GORGE = `gorge: { rock: [176, 92, 96], grass: '#c88a6a', grass2: '#a86a52', grass3: '#e8b48a',
    edge: '#3a2020', skyTop: '#8E5A56', skyMid: '#C08878', skyLow: '#DCB498',
    hill: '#7A4A48', jungle: ['#5E3428', '#46241C', '#32180F'], cave: false, dim: 0.16 },`;
const CANYON = `gorge: { rock: [186, 122, 78], grass: '#d8a24f', grass2: '#a8763a', grass3: '#f0cc84',
    edge: '#4a2a16', skyTop: '#E8A96B', skyMid: '#F4D8A8', skyLow: '#FBF0D2',
    hill: '#B07A5A', jungle: ['#7d5a3a', '#63452c', '#4a3320'], cave: false, dim: 0.26 },`;

/* 第二刀：把 ice（1-4）改成和 windy（1-8）接近的配色 */
const ICE = `ice: { rock: [176, 204, 218], grass: '#ddf5fd', grass2: '#b0e0f0', grass3: '#f8ffff',
    edge: '#4a7286', skyTop: '#B4DCF2', skyMid: '#E2F2FA', skyLow: '#F8FEFF',
    hill: '#A8C8DC', jungle: ['#97C0D4', '#83AEC4', '#71A0B4'], cave: false, dim: 0.26 },`;
const ICE_LIKE_WINDY = `ice: { rock: [96, 150, 150], grass: '#7fc8b0', grass2: '#5aa892', grass3: '#bfe8dc',
    edge: '#1a3a38', skyTop: '#4FA8C8', skyMid: '#A8DCE8', skyLow: '#E8F8F4',
    hill: '#78b8bc', jungle: ['#3A7A72', '#2C635C', '#204E48'], cave: false, dim: 0.10 },`;

const CASES = [
  { name: '把 1-7 的配色整段换成 1-2 的（复制忘改）',
    from: GORGE, to: CANYON },
  { name: '把 1-4 的配色整段换成 1-8 的',
    from: ICE, to: ICE_LIKE_WINDY }
];

const base = run();
console.log('基线：' + base.pass + '/' + base.total);
if (base.pass !== base.total) base.fails.forEach(l => console.log('  ' + l));

let bad = 0;
for (const c of CASES) {
  if (!orig.includes(c.from)) { console.log('  SKIP ' + c.name + '：找不到锚点'); bad++; continue; }
  fs.writeFileSync(P, toDisk(orig.split(c.from).join(c.to)), 'utf8');
  const r = run();
  fs.writeFileSync(P, toDisk(orig), 'utf8');
  const turned = r.pass < base.pass;
  if (!turned) bad++;
  console.log('  ' + (turned ? '变红 ✓' : '仍然全绿 ✗') + '  ' + c.name +
    '  → ' + r.pass + '/' + r.total);
  r.fails.slice(0, 3).forEach(l => console.log('      ' + l));
}
fs.writeFileSync(P, toDisk(orig), 'utf8');
console.log(bad ? '\n有反向验证不成立' : '\n两条判据都能失败 —— 它们量的是真东西');
process.exit(bad ? 1 : 0);

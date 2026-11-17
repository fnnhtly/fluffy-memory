/* [RED-PROOF] 把风特效的"按 dt 累积"改回"每帧固定 3 条"，
 * 用来证明 tools/test_wind_fx.js 的 D 组判据真的能失败。
 *
 * 用法：node tools/_redproof_windfx.js back|fix
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const P = path.join(__dirname, '..', 'prototype', 'index.html');
const GOOD = path.join(os.tmpdir(), 'idx-windfx-good.html');
const mode = process.argv[2] || 'back';

if (mode === 'fix') {
  fs.copyFileSync(GOOD, P);
  console.log('restored from', GOOD);
  process.exit(0);
}

fs.copyFileSync(P, GOOD);
let s = fs.readFileSync(P, 'utf8');
const before = 'state.windAcc += dt * RATE;';
if (s.indexOf(before) < 0) { console.log('MARKER NOT FOUND'); process.exit(1); }
s = s.split(before).join('state.windAcc += 3;   // [RED-PROOF] 每帧固定 3 条');
fs.writeFileSync(P, s, 'utf8');
console.log('patched: per-frame fixed emission (backup at', GOOD + ')');

/* 一键跑完全部自检。
 *
 * 用法：
 *   node tools/verify.mjs          全量（数值 + 全部交互脚本）
 *   node tools/verify.mjs --fast   只跑数值校核（约 2 秒）
 *
 * 检查项：
 *   1. check_html_logic.js     34 项数值校核
 *   2. 12 个交互/流程脚本      真实浏览器 + 真实鼠标，检查 0 控制台异常
 *   3. 内联脚本语法
 *
 * 退出码：0 全绿；1 有失败
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const fast = process.argv.includes('--fast');

const SCRIPTS = [
  'test_eraser.js',
  'test_help_close.js',
  'test_brake.js',
  'test_pig_mood.js',
  'test_levelselect.js',
  'test_welcome.js',
  'test_resolutions.js',
  'test_intro.js',
  'test_no_autospin.js',
  'test_arrow_visibility.js',
  'test_fullplay.js',
  'test_drive_sequence.js',
  'test_wheel_spin.js',
  'test_touch_fx.js',
  'test_touch_all.js'
];

function run(cmd, args, label, timeoutMs = 180000) {
  const t0 = Date.now();
  try {
    const out = execFileSync(cmd, args, {
      cwd: ROOT, encoding: 'utf8', timeout: timeoutMs, stdio: 'pipe'
    });
    const ms = Date.now() - t0;
    return { ok: true, label, ms, out };
  } catch (e) {
    const ms = Date.now() - t0;
    return { ok: false, label, ms, out: (e.stdout || '') + (e.stderr || '') };
  }
}

const results = [];

// 1) 数值校核
{
  const r = run(process.execPath, [path.join('prototype', 'check_html_logic.js')], '数值校核 34 项');
  const m = (r.out || '').match(/PASS (\d+) \/ FAIL (\d+)/);
  const pass = !!(m && m[2] === '0' && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `PASS ${m[1]} / FAIL ${m[2]}` : '无法解析' });
}

// 2) 内联脚本语法
{
  const r = run(process.execPath, [path.join('tools', 'check_inline_js.js')], '内联脚本语法');
  results.push({ ...r, ok: r.ok && /all inline scripts OK/.test(r.out), detail: r.ok ? 'OK' : '语法错误' });
}

// 3) 交互脚本
if (!fast) {
  for (const s of SCRIPTS) {
    const r = run(process.execPath, [path.join('tools', s)], s.replace('.js', ''));
    const hasErr = /errors: \(none\)/.test(r.out);
    const passLine = /PASS[：:]/.test(r.out);
    results.push({ ...r, ok: r.ok && hasErr, detail: hasErr ? (passLine ? 'PASS + 0 异常' : '0 异常') : '有异常/超时' });
  }
}

// 汇总
console.log('\n================ 自检汇总 ================');
let fail = 0;
for (const r of results) {
  const mark = r.ok ? '✓' : '✗';
  if (!r.ok) fail++;
  console.log(`${mark} ${r.label.padEnd(26)} ${String(r.ms).padStart(6)}ms  ${r.detail}`);
}
console.log('==========================================');
console.log(fail === 0
  ? `全部通过（${results.length} 项）`
  : `有 ${fail} 项失败（共 ${results.length} 项）`);
process.exit(fail === 0 ? 0 : 1);

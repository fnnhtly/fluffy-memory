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
  'test_help_pause.js',
  'test_brake.js',
  'test_pig_mood.js',
  'test_levelselect.js',
  'test_welcome.js',
  'test_resolutions.js',
  'test_intro.js',
  'test_no_autospin.js',
  'test_arrow_visibility.js',
  'test_run_banner.js',
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

// 3) 审计器自检（判定逻辑本身必须被证明：能抓真问题、不报假问题）
{
  const r = run(process.execPath, [path.join('tools', 'selftest_audit.js')], '审计器自检');
  const m = (r.out || '').match(/PASS (\d+) \/ FAIL (\d+)/);
  const pass = !!(m && m[2] === '0' && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `PASS ${m[1]} / FAIL ${m[2]}` : '无法解析' });
}

// 3b) 像素探针自检
{
  const r = run(process.execPath, [path.join('tools', 'selftest_pixel_probe.js')], '像素探针自检');
  const m = (r.out || '').match(/PASS (\d+) \/ FAIL (\d+)/);
  const pass = !!(m && m[2] === '0' && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `PASS ${m[1]} / FAIL ${m[2]}` : '无法解析' });
}

// 4) 排版审计（真浏览器抓每一帧的文字包围盒：越界 / 压字 / 出卡）
if (!fast) {
  const r = run(process.execPath, [path.join('tools', 'test_layout_audit.js')], '排版审计');
  const m = (r.out || '').match(/合计问题: (\d+)/);
  const hasErr = /errors: \(none\)/.test(r.out);
  const pass = !!(r.ok && m && m[1] === '0' && hasErr);
  results.push({ ...r, ok: pass, detail: m ? `问题 ${m[1]} 条${hasErr ? '' : ' + 有异常'}` : '无法解析' });
}

// 4b) 像素探针（零件一览页 7 个图标真的画出来了）
if (!fast) {
  const r = run(process.execPath, [path.join('tools', 'test_parts_page.js')], '零件一览页图标');
  const m = (r.out || '').match(/图标未绘制: (\d+)/);
  const hasErr = /errors: \(none\)/.test(r.out);
  const pass = !!(r.ok && m && m[1] === '0' && hasErr);
  results.push({ ...r, ok: pass, detail: m ? `未绘制 ${m[1]} 个${hasErr ? '' : ' + 有异常'}` : '无法解析' });
}

// 5) 交互脚本
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

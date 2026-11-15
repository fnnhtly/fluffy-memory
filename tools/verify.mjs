/* 一键跑完全部自检。
 *
 * 用法：
 *   node tools/verify.mjs          全量（数值 + 全部交互脚本）
 *   node tools/verify.mjs --fast   只跑数值校核（约 2 秒）
 *
 * 检查项：
 *   1. check_html_logic.js     39 项数值校核
 *   1b. test_parts_lift.js     34 条气球/沙袋机制断言（纯 Node）
 *   1c. test_1_6.js            18 条 1-6 设计判定（读真 level 文件）
 *   2. 39 个交互/流程脚本      真实浏览器 + 真实鼠标，检查 0 控制台异常
 *   3. 内联脚本语法
 *
 * 退出码：0 全绿；1 有失败
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require2 = createRequire(import.meta.url);
const { verdict } = require2('./lib/verdict.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const fast = process.argv.includes('--fast');

const SCRIPTS = [
  'test_eraser.js',
  'test_help_close.js',
  'test_help_pause.js',
  'test_hud_overlap.js',
  'test_progress_track.js',
  'test_challenge_bar.js',
  'test_coins.js',
  'test_no_break.js',
  'test_launch_spec.js',
  'test_ghost_buttons.js',
  'test_brake.js',
  'test_pig_mood.js',
  'test_levelselect.js',
  'test_welcome.js',
  'test_resolutions.js',
  'test_intro.js',
  'test_no_autospin.js',
  'test_drag_unequip.js',
  'test_undo.js',
  'test_arrow_visibility.js',
  'test_run_banner.js',
  'test_fullplay.js',
  'test_lift_ui.js',
  'test_result_keys.js',
  'test_all_levels.js',
  'test_drive_sequence.js',
  'test_replay.js',
  'test_replay_parts.js',
  'test_resolve_sync.js',
  'test_progress_watchdog.js',
  'test_1_6_browser.js',
  'test_chapter_end.js',
  'test_coin_display.js',
  'test_fail_culprit.js',
  'test_wheel_spin.js',
  'test_touch_fx.js',
  'test_touch_all.js',
  'test_frame_damage.js',
  'test_impact_dedupe.js',
  'test_break_sfx.js',
  'test_hold_key.js',
  'test_button_release.js',
  'test_brake_release.js',
  'test_pump_charge_ring.js',
  'test_battery_icon.js',
  'test_motor_out.js',
  'test_perf_stable.js'
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
  const r = run(process.execPath, [path.join('prototype', 'check_html_logic.js')], '数值校核 39 项');
  const m = (r.out || '').match(/PASS (\d+) \/ FAIL (\d+)/);
  const pass = !!(m && m[2] === '0' && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `PASS ${m[1]} / FAIL ${m[2]}` : '无法解析' });
}

// 1b) 气球 / 沙袋的机制单测（纯 Node，不开浏览器）
{
  const r = run(process.execPath, [path.join('tools', 'test_parts_lift.js')], '气球沙袋机制');
  const m = (r.out || '').match(/ASSERTS (\d+) \/ (\d+)/);
  const pass = !!(m && m[1] === m[2] && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `ASSERTS ${m[1]} / ${m[2]}` : '无法解析' });
}

// 1c) 1-6 的设计判定（四格 + 容错 + 关卡结构，读真 level 文件）
{
  const r = run(process.execPath, [path.join('tools', 'test_1_6.js')], '1-6 教学设计');
  const m = (r.out || '').match(/ASSERTS (\d+) \/ (\d+)/);
  const pass = !!(m && m[1] === m[2] && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `ASSERTS ${m[1]} / ${m[2]}` : '无法解析' });
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

// 3c) 对比度量尺自检
{
  const r = run(process.execPath, [path.join('tools', 'selftest_contrast.js')], '对比度量尺自检');
  const m = (r.out || '').match(/PASS (\d+) \/ FAIL (\d+)/);
  const pass = !!(m && m[2] === '0' && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `PASS ${m[1]} / FAIL ${m[2]}` : '无法解析' });
}

// 3d) 像素探针自检
{
  const r = run(process.execPath, [path.join('tools', 'selftest_pixel_probe.js')], '像素探针自检');
  const m = (r.out || '').match(/PASS (\d+) \/ FAIL (\d+)/);
  const pass = !!(m && m[2] === '0' && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `PASS ${m[1]} / FAIL ${m[2]}` : '无法解析' });
}

// 3e) 公共断言器自检（整套回归的地基）
{
  const r = run(process.execPath, [path.join('tools', 'selftest_asserts.js')], '断言器自检');
  const m = (r.out || '').match(/PASS (\d+) \/ FAIL (\d+)/);
  const pass = !!(m && m[2] === '0' && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `PASS ${m[1]} / FAIL ${m[2]}` : '无法解析' });
}

// 3f) 通过判定规则自检（证明 verify 自己抓得住"假绿"）
{
  const r = run(process.execPath, [path.join('tools', 'selftest_verdict.js')], '通过判定自检');
  const m = (r.out || '').match(/PASS (\d+) \/ FAIL (\d+)/);
  const pass = !!(m && m[2] === '0' && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `PASS ${m[1]} / FAIL ${m[2]}` : '无法解析' });
}

// 3g) 引擎↔渲染层静态对账（写的有人读吗 / 读的有人写吗 / 事件有人听吗）
{
  const r = run(process.execPath, [path.join('tools', 'audit_state_fields.js')], '状态字段对账');
  const m = (r.out || '').match(/ASSERTS (\d+) \/ (\d+)/);
  const pass = !!(m && m[1] === m[2] && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `ASSERTS ${m[1]} / ${m[2]}` : '无法解析' });
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

// 4c) 对比度审计（文字压不压底：同一画面拍两遍，只翻转"要不要画字"）
if (!fast) {
  const r = run(process.execPath, [path.join('tools', 'test_text_contrast.js')], '对比度审计');
  const m = (r.out || '').match(/低对比文字: (\d+) \/ (\d+)/);
  const hasErr = /errors: \(none\)/.test(r.out);
  const pass = !!(r.ok && m && m[1] === '0' && hasErr);
  results.push({ ...r, ok: pass, detail: m ? `低对比 ${m[1]}/${m[2]} 条${hasErr ? '' : ' + 有异常'}` : '无法解析' });
}

// 4d) 选关缩略图（五关必须一眼看得出不同）
if (!fast) {
  const r = run(process.execPath, [path.join('tools', 'test_level_thumbs.js')], '选关缩略图');
  const hasErr = /errors: \(none\)/.test(r.out);
  const pass = !!(r.ok && hasErr);
  results.push({ ...r, ok: pass, detail: hasErr ? '可辨' : '有异常' });
}

// 5) 交互脚本
//    判定规则抽到 tools/lib/verdict.js（它自己有 selftest_verdict.js 证明能失败）：
//      a. 退出码 0；b. 0 控制台异常；c. 必须打出 `ASSERTS n / n` 且 n>0。
//    没有 ASSERTS 行 = 退回了"只打印不判定"，直接算失败。
if (!fast) {
  for (const s of SCRIPTS) {
    let r = run(process.execPath, [path.join('tools', s)], s.replace('.js', ''));
    let v = verdict(r.out, r.ok);
    // 每个脚本自己起一个 headless Edge。偶尔会有"浏览器没在 15 秒内起来"
    // 这类基础设施抖动（不是回归），所以失败后**只重试一次**：
    // 真回归一定两次都红，抖动第二次就过去了。
    if (!v.ok) {
      const r2 = run(process.execPath, [path.join('tools', s)], s.replace('.js', '') + '（重试）');
      const v2 = verdict(r2.out, r2.ok);
      if (v2.ok) {
        results.push({ ...r2, label: s.replace('.js', ''), ok: true, detail: v2.reason + '（首次抖动）' });
        continue;
      }
      r = r2; v = v2;
    }
    results.push({ ...r, ok: v.ok, detail: v.reason });
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

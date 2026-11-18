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
  'test_stars.js',
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
  'test_fail_culprit.js',
  'test_wheel_spin.js',
  'test_touch_fx.js',
  'test_touch_all.js',
  'test_frame_damage.js',
  'test_impact_dedupe.js',
  'test_break_sfx.js',
  'test_hold_key.js',
  'test_button_release.js',
  'test_brake_removed.js',
  'test_pump_charge_ring.js',
  'test_power_tether.js',
  'test_specs_r63.js',
  'test_perf_stable.js',
  'test_focus_blur.js',
  'test_mute.js',
  'test_hint.js',
  'test_build_view.js',
  'test_no_black_block.js',
  'test_tex_parallax.js',
  'test_build_preview.js',
  'test_world_anchor.js',
  'test_grid_is_visual.js',
  'test_hill_parallax.js',
  'test_recentre.js',
  'test_wind_direction.js',
  'test_wind_fx.js',
  'test_weld.js',
  'test_parts_connected.js',
  /* 第 76 轮：整车是不是刚体。前两条只在**建造期**量接缝（那时 car.a 恒为 0），
   * 行驶期的形状从来没量过 —— 于是"零件被画成 2a 偏转"活到了用户截图。 */
  'test_rigid_parts.js',
  /* 第 76 轮：焊接之后的缝在**行驶期**还在不在（含车身倾斜）。 */
  'test_frame_edges.js',
  /* 第 78 轮：焊接机制已按用户要求删除。这一条守"真的没了"：
   * 名字一个都不剩、drawPartShape 只剩 8 个参数、每块框四条边都画。 */
  'test_no_welding.js',
  /* 第 79 轮：提示文案和关卡现实对不对得上。
   * 改关卡改得凶的几轮里，HINTS 是手写中文句子 —— 关卡一动文案就可能变成假话，
   * 而"按提示做却过不去"是最伤引导的一类问题。 */
  'test_hints_truth.js',
  /* 第 79 轮：提示写了 4 层但界面只让翻到第 3 层 —— 第 4 层（最具体的「成品：」）
   * 永远显示不出来。这一条守"写下的每一层都翻得到"。 */
  'test_hint_tiers.js',
  /* 第 80 轮：质心修正之后的手感基线（起步 / 极速 / 腾空 / 落地 / 坡速 / 抬头）。
   * 纯 Node 跑真物理。这一组是**性能基线**，最容易变成永远不会红的装饰，
   * 所以带一份 tools/_redproof_feel.js 逐条证明它们能失败。 */
  'test_feel.js',
  /* 第 81 轮：1-6 的浮力/配重机制可不可预期。
   * 这一关是八关里唯一手感数据异常的（第 80 轮量到 17 次硬撞击）——
   * 查清楚之后发现那 17 次是**我的量法**造成的（手写循环没处理 _drops），
   * 但顺带证明了这一关真的有决策：三种方向、时机窗口、9 种构型。 */
  'test_lift_predictable.js',
  'test_lift_level.js',
  /* 第 83 轮：雷屏障的两处坐标原点 bug。
   * `hull.maxX` 相对**网格锚点**而不是包围盒中心 —— 单框车的 maxX 是 −1，
   * 于是 nose/fromLeft 全判错，整批车能穿过屏障。 */
  'test_barrier.js',
  /* 第 83 轮：难度曲线。用"随机造法通关率"而不是"标准解时长"
   * （后者只量关卡长度）。零件池从 partsBox 读，种子会放也会触发。 */
  'test_difficulty_curve.js',
  /* 第 84 轮：1-8 的难度结构 —— 它是"配置题"（凑齐风种 + 吃风件 + 驱动件），
   * 不是"操作题"。这一条把那个性质钉住，并确认最后两关是最难的两关。 */
  'test_1_8_structure.js',
  /* 第 85 轮：可辨识度。八关各抓一帧，量"全黑占比 / 车与背景的亮度差 /
   * 地形跳变次数"。这一条抓到 1-3 的洞穴配色 68.1% 的像素亮度 < 40。 */
  'test_legibility.js',
  /* 第 86 轮：HUD 会不会挡住车 / 木箱 / 终点旗。
   * ⚠ 这一条第一版读 `state.camLive` 算屏幕坐标，而 camLive 只在**渲染**时更新，
   * 用 RAP.step() 推进时它不动 —— 于是量出了"1-6 车被盖 75%"这个假数据。
   * 现在按 drawRun 的同一套公式算镜头，再加一条真渲染截图的视觉自证。 */
  'test_hud_occlusion.js',
  /* 第 87 轮：HUD 与车驻留区的**纯几何**判据。
   * test_hud_occlusion 的逐帧遮挡其实是恒等式（车在屏幕上的位置由镜头公式
   * 固定为 cx∈[427,550]、cy∈[427,449]，而 HUD 下沿是 234 —— 结构上不可能相交）。
   * 真正守"HUD 不挡车"的是这一条，它带自证：HUD 下移 300px 时必须红。 */
  'test_hud_geometry.js',
  /* 第 87 轮：离地时车正下方的地面必须在画面内（落点可见性）。 */
  'test_ground_visible.js',
  /* 第 88 轮：`pillarRise` 的守卫。这一条是 `mutation_sweep.js` 扫出来的 ——
   * 把 pillarRise 从 0.35 改成 0 或 2.0，全部 33 个纯 Node 测试里没有一条变红。
   * 而它的注释写着"更慢的话车会先滑出柱子的范围，更快的话视觉上像瞬移"。 */
  'test_pillar_rise.js',
  /* 第 89 轮：**画面里该有的东西真的画出来了吗**。
   * `mutation_browser.js` 扫出来三条（drawTray / drawHintBtn / drawHintCard）
   * 整个早退掉也没有任何测试变红 —— 因为现有测试量的是**逻辑**
   * （`trayRect(i)` 的坐标、`hintFor` 的文案），不是像素。
   * 这一条对每个"必须看得见"的东西做隐藏前后像素差分。 */
  'test_draw_presence.js',
  /* 第 88 轮：`pillarRise` 的守卫。这一条是 `tools/mutation_sweep.js` 扫出来的 ——
   * 把 pillarRise 从 0.35 改成 0 或 2.0，全部 33 个纯 Node 测试里没有一条变红。
   * 而它的注释写着"更慢的话车会先滑出柱子的范围，更快的话视觉上像瞬移"。
   *
   * ⚠ `mutation_sweep.js` 本身**不进这套回归**：它跑 19 个变异 × 34 个测试，
   * 约 4 分钟。它是开发期审计工具，每十几轮手动跑一次
   * （`node tools/mutation_sweep.js`），结果记在 docs/parts-redesign.md。
   * 同理 `mutation_browser.js`（9 变异 × 9 浏览器测试，约 14 分钟）。 */
  /* 第 82 轮：看门狗的结构性安全边际（W 必须大于最长标准解时长）。
   * 以及 test_watchdog_health.js —— 走引擎的 trace 复扫阈值。 */
  'test_watchdog_structural.js',
  'test_watchdog_health.js',
  'test_seeds.js',
  /* 第 77 轮：车身姿态。平地静止必须水平、松手必须回正、坡上必须贴坡。
   * 纯 Node 跑真物理（不开浏览器）—— 它量的是引擎，不是画面。 */
  'test_car_stance.js',
  'test_seed_levels.js',
  'test_seed_fx.js',
  'test_seed_button.js',
  'test_tray_scope.js'
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

// 1d) 限时归谁（关卡 timeLimit 是活字段，不是死旋钮）
{
  const r = run(process.execPath, [path.join('tools', 'test_time_limit.js')], '限时归属');
  const m = (r.out || '').match(/ASSERTS (\d+) \/ (\d+)/);
  const pass = !!(m && m[1] === m[2] && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `ASSERTS ${m[1]} / ${m[2]}` : '无法解析' });
}

// 1e) 关卡数据 schema（脏数据必须被出口拦住，干净数据必须通过）
{
  const r = run(process.execPath, [path.join('tools', 'test_level_schema.js')], '关卡数据 schema');
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

// 3h) 零件表对账（表里每个字段都得有人读；说明文字里的数字不能撒谎）
{
  const r = run(process.execPath, [path.join('tools', 'audit_parts_spec.js')], '零件表对账');
  const m = (r.out || '').match(/ASSERTS (\d+) \/ (\d+)/);
  const pass = !!(m && m[1] === m[2] && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `ASSERTS ${m[1]} / ${m[2]}` : '无法解析' });
}

// 3i) 可调参数对账（DEFAULTS 里每个"旋钮"都得真的有人拧它）
{
  const r = run(process.execPath, [path.join('tools', 'audit_params.js')], '可调参数对账');
  const m = (r.out || '').match(/ASSERTS (\d+) \/ (\d+)/);
  const pass = !!(m && m[1] === m[2] && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `ASSERTS ${m[1]} / ${m[2]}` : '无法解析' });
}

// 3j) 触地档位（四级反馈必须铺在玩家真的到得了的速度区间）
{
  const r = run(process.execPath, [path.join('tools', 'test_touch_ladder.js')], '触地档位');
  const m = (r.out || '').match(/ASSERTS (\d+) \/ (\d+)/);
  const pass = !!(m && m[1] === m[2] && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `ASSERTS ${m[1]} / ${m[2]}` : '无法解析' });
}

// 3k) 关卡数据对账（第四张表：数据里每个字段都得有读者 + 不许有第二份真相）
{
  const r = run(process.execPath, [path.join('tools', 'audit_level_fields.js')], '关卡数据对账');
  const m = (r.out || '').match(/ASSERTS (\d+) \/ (\d+)/);
  const pass = !!(m && m[1] === m[2] && r.ok);
  results.push({ ...r, ok: pass, detail: m ? `ASSERTS ${m[1]} / ${m[2]}` : '无法解析' });
}

// 3l) 读空对账（状态字段对账的反向：渲染层读了，引擎真的写过吗）
//     第 57 轮的两个 bug（lastImpactAt / lastBoxAt 从没被写过，dizzy 与
//     "吃到木箱就笑"两个分支从写下的那天起就是死的）就是这一支抓到的。
{
  const r = run(process.execPath, [path.join('tools', 'audit_dead_reads.js')], '读空对账');
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

/* 4a) 临时目录卫生（第 75 轮）。
 *
 * 这一条是**元层**的：它不测游戏，它测"跑测试这件事本身会不会把机器搞坏"。
 * 起因：`git commit` 报了 `ENOSPC` —— `%TEMP%` 下 1362 个 `edge*` 配置目录、
 * 27.8 GB。每个脚本 spawn headless Edge 时指定 `--user-data-dir=<tmp>/edgeXXX-时间戳`，
 * 跑完从来没删。修法在 `tools/lib/asserts.js` 的 killTree（每个脚本唯一的收尾口），
 * 但那样也有漏网的可能，所以再加两道：
 *   · `test_temp_hygiene.js` —— 验 killTree 真的会删、且不误删；
 *   · `audit_profile_leaks.js` —— 验 verify 里每个 spawn 浏览器的脚本都会经过它。
 */
if (!fast) {
  {
    const r = run(process.execPath, [path.join('tools', 'test_temp_hygiene.js')], '临时目录卫生');
    const m = (r.out || '').match(/ASSERTS (\d+) \/ (\d+)/);
    const pass = !!(m && m[1] === m[2] && r.ok);
    results.push({ ...r, ok: pass, detail: m ? `ASSERTS ${m[1]} / ${m[2]}` : '无法解析' });
  }
  {
    const r = run(process.execPath, [path.join('tools', 'audit_profile_leaks.js')], '浏览器配置目录泄漏');
    const pass = !!(r.ok && /✓ 每个 spawn 浏览器的脚本/.test(r.out));
    results.push({ ...r, ok: pass, detail: pass ? '无泄漏' : '有脚本没走 killTree' });
  }
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

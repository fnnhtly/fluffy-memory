# 制作计划 · 滚蛋吧！猪（roll-away-pig）

## 当前状态

- 当前位置：**步骤 3（HTML 效果展示）已可玩、已按参考重做两轮系统与内容 → 下一步步骤 5（Lua 实现）**。
- 三个已拍板决定（用户 2026-04-19 确认，不再讨论）：
  1. 首版范围 = **1-1 ~ 1-6 垂直切片**（6 个核心零件 + 气球/沙袋 = 9 件）；
  2. 屏幕 = **横屏 1280×720**（千星无竖屏画布）；
  3. 工程 = **新建 `workspace/roll-away-pig`，从零写**。
- 用户 2026-04-19 追加的美术方向：**画风结合——优先官方素材造景产生 3D 感，交互物与 UI 用图元**；
  随后进一步确认 **「更原神一点好」**（已定：深青天 + 暖金地平线 + 金绿草皮 + 官方图标 UI）。
- **实测结论（重要）**：官方 imageId 白名单共 33 个号段、约 1200 个 id，**全是原神 UI 图标/面板/铭牌/评级，
  没有任何地形/树/海/天空场景贴图**（证据 `docs/art/imageid-probe-1.png`、`imageid-probe-2.png`）。
  所以"官方素材造景"落地为：**官方底纹当背景层 + 图元分层造景**；官方素材真正的价值在 **UI 图标**。
- 用户 2026-05 追加的**质量基准**：「以捣蛋猪为参考模板来做」→
  研究结论存 `docs/reference-badpiggies.md`（含来源与拿不到的来源，如实标注）。
  据此完成两处系统级修正：**三星累计制**（存档写 `goals` 三标记而非单个数字）与
  **「不散架 KRAK SNAP」第三星**；顺带修掉 `damageCar` 里一个永远进不去的伤害档位，
  以及 1-2「按一下」三星条件与关卡名互相矛盾的问题。
- 用户 2026-05 追加的方向：**「补气球/沙袋，把玩法做深」**（在"转 Lua"与"补关卡"之间选定）。
  已完成：两个零件全链路（数据 / 规则 / 物理 / 渲染 / HUD / 交互）+ 第 6 关《抬个头》。
  详见 `docs/reference-badpiggies.md` §9 与 `records/playtest.md` 第 37 轮。

## 知识来源与可用性（PREFLIGHT，本轮复用 tumble-piggy 的结论并复核）

| 来源 | 工具/路径 | 文档与版本 | 适用范围 | 读取结果 |
|---|---|---|---|---|
| 千星官方客户端文档库 | `list_client_documents` / `get_client_document` | `客户端控件和客户端脚本`(mhbgxf0nynww)、`客户端控件API文档`(mhtakr07vej4)，crawledAt 2026-09-25 | 客户端 2D UI + Lua | 已取得：生命周期、`EnableUpdate`、`InstantiateClientUIControl`、控件字段/方法、`AddCursorEventListener`/`CursorEventData`、`AddKeyEventListener`、`showCursor`/`raycastTarget`、Lua 5.3 受限库 |
| 千星沙箱模拟器 | `qxqy_studio_get/patch/play/load/*_screenshot`、`qxqy_script_sync` | 当前会话可用 | 存档编辑、试玩、截图、脚本同步 | 已在 tumble-piggy 上实测（`pointer`/`click {name}`/`key` 注入规则、图元映射、绘制顺序=创建顺序） |
| 模拟器操作 Skill | `qxqy-simulator` | 会话内 | 存档格式、工具用法 | 已加载 |
| 策划案 v1.0 | 用户提供 `滚蛋吧猪_游戏策划案_v1.0.docx` | v1.0 立项稿 | 玩法语义 | 已全文提取：`docs/source-gdd-v1.0.txt`（463 行） |
| 附录 A/B 数据 | 自行校验脚本 `tools-docx/validate_312.py` | — | 3-12 关卡数据 | **自洽**：16×72、13 个喷火口坐标全对、2 条熔岩渠全对、S/E/B 与 JSON 一致（`docs/check-312.md`） |
| 参考游戏拆解 | `docs/reference-badpiggies.md` | 萌娘百科 + 百度百科（Edge headless + CDP） | 三星体系、零件表、系统取舍 | **已取得**。Wikipedia / Fandom / r.jina.ai 本机直连超时，B 站视频无法解码 —— 未观看任何视频，结论全部来自两篇百科正文 |

已确认缺项：**无**（2D UI+Lua 所需官方接口齐备）。未使用 3D 节点图知识库。

## 产物与状态

| 产物 | 路径 | 状态 |
|---|---|---|
| 切片策划案 | `docs/gdd.md` | ✅ v0.3（+ 气球/沙袋口径、浮力模型 §5.3、终点高度门槛 §5.4、1-6） |
| 参考拆解 | `docs/reference-badpiggies.md` | ✅ 含来源标注、差距排序、落地记录（§8 第 36 轮 / §9 第 37 轮） |
| 原稿全文 | `docs/source-gdd-v1.0.txt` + `reference/*.docx` | ✅ |
| 3-12 数据校验 | `docs/check-312.md` | ✅ 全绿（不进切片，备查） |
| 测试用例 | `tests/cases.md` + `tests/*.json`（15 个） | ✅ schema 自检通过 |
| 关卡数据 | `levels/01.json`…`06.json`（出口 `tools/build_levels_js.js`） | ✅ schema 校验通过（出口会拒绝任何脏数据） |
| HTML 效果展示 | `prototype/index.html` + `game.js` + `levels.js` + `README.md` | ✅ 可玩；**93 项自检全绿**（68 个脚本 + 23 项静态/度量尺自检） |
| 数值校核 | `prototype/check_html_logic.js`、`tools/check_inline_js.js` | ✅ 40/40 |
| 木框耐久可见性 | `tools/test_frame_damage.js` + `tools/probe_damage_tiers.js` | ✅ 15/15（三档像素读数：绿/金/红；掉耐久有音效与轻抖；碎后整块隐去） |
| 撞击演出去重 | `tools/test_impact_dedupe.js` + `tools/probe_impact_spam.js` | ✅ 8/8（旧版一次硬着陆写 34 条 `impact` → 慢放/白闪反复重置；现在 22 个接触收敛成 1 条） |
| 「裂」与「碎」反馈分离 | `tools/test_break_sfx.js` | ✅ 8/8（裂纹走 `crack`、碎框走 `structBreak`，一次撞击只响一声；碎框此前与"撞了一下"听起来一模一样） |
| 按住蓄力可用性 | `tools/test_hold_key.js` + `tools/test_button_release.js` | ✅ 6/6 + 7/7（auto-repeat 曾把 `pumpPress` 顶到 17 → 1-2 三星永远拿不到；滑出按钮松手曾让 `pumpHeld` 永远卡住） |
| 刹车键松开 | `tools/test_brake_release.js` | ✅ 8/8（按住 S 松手后仍一直刹着，整局开不动；auto-repeat 也曾把 `brake on` 写成 13 条） |
| 打气筒蓄力可见 | `tools/test_pump_charge_ring.js` + `tools/probe_pump_charge_feedback.js` | ✅ 12/12（蓄力时按钮外沿蓝弧→满时金环；此前按住 0.8 秒画面变化量与噪声底同量级） |
| 电池电量可读 | `tools/test_battery_icon.js` + `tools/probe_battery_icon.js` | ✅ 11/11（车上电池电量条随电量变短；此前读一个从没被写过的 `def.__pct`，永远满格） |
| 断电反馈与归因 | `tools/test_motor_out.js` + `tools/probe_motor_out.js` | ✅ 9/9（断电前画面零变化；现弹提示 + 能量栏改写 + 失败归因点名电池；一次断电只写一条事件） |
| 数据表对账 | `tools/audit_parts_spec.js` + `tools/audit_state_fields.js` | ✅ 4/4 + 6/6（`PARTS` 里 4 个死字段已删、铁轮说明的 0.3 kg 已改成 0.9 kg；引擎写的状态与渲染读的状态全部对得上） |
| 读空对账 | `tools/audit_dead_reads.js` + `tools/test_pig_mood.js` | ✅ 11/11 + 9/9（**反向**对账：渲染层读的 run 字段引擎写过没有。查出 `lastImpactAt` / `lastBoxAt` 从未被写入 → 猪的 dizzy 与"吃到木箱就笑"两个分支从写下的那天起就是死的；`undefined \|\| -9` 让"字段不存在"伪装成"条件不成立") |
| 切走窗口 | `tools/test_focus_blur.js` + `tools/probe_focus_combo.js` / `probe_focus_switch.js` | ✅ 28/28（第 58 轮：页面里原先**一条** `blur`/`visibilitychange` 监听都没有 → 按住的键永远松不开、`heldBtn` 卡在 1、回来时迎面撞一局已跑完的比赛。现在切走会清按住状态 + 自动暂停（暂停卡写明"窗口切走了，已经替你暂停"）+ 复位拖拽手势，且**取消**交互而非**松开**交互（不许凭空推车一下）。量具用无头环境里唯一送得到事件的组合：`setFocusEmulationEnabled:false` + `setWebLifecycleState:frozen`） |
| 限时归属 | `tools/test_time_limit.js` + `probe_time_cap.js` / `probe_timeout_reach.js` / `probe_slow_legal.js` | ✅ 11/11（关卡 `timeLimit` 从死字段变活；1440 局实测 timeout 零触发，最慢合法局 22.13 秒 vs 限时 120 秒） |
| 可调参数对账 | `tools/audit_params.js` | ✅ 4/4（`DEFAULTS` 23 个旋钮逐个查读者；注释里出现 `Params.xxx` 不算） |
| 触地反馈量程 | `tools/test_touch_ladder.js` + `probe_impact_speed.js` / `probe_impact_range.js` / `probe_touch_ladder.js` | ✅ 21/21（四级档位原先铺在 0.8/2.5/4.5/6，而八关标准解 28 次触地全在 0.80~1.70 → 通关全程只有 lvl1。lvl2 挪到 1.35：标准解落地真的有尘土轻震，仍 0 条 lvl3+、0 伤害） |
| 关卡数据对账 | `tools/audit_level_fields.js` + `tools/test_level_schema.js` | ✅ 18/18 + 20/20（第四张假旋钮表：`levels/*.json` 原有 **9 个死字段**（physics 整块、buildArea、grid.cell/px、start.row/goal.row、materials[].surfaceRow、chapter、note）已全部删除；`surfaceRow` 更是在 9 段材质里 **6 段说假话**。出口 `build_levels_js.js` 现在会拒收任何脏数据） |
| 气球沙袋机制 | `tools/test_parts_lift.js` | ✅ 35/35 |
| 1-6 教学设计 | `tools/test_1_6.js` + `tools/test_1_6_browser.js` | ✅ 18/18 + 16/16（Node 与真实浏览器必须给出同一个结论） |
| 失败回放可见性 | `tools/test_replay_parts.js` | ✅ 9/9（像素对照：有气球 vs 没气球差 5900 点） |
| 「没有进展」看门狗 | `tools/test_progress_watchdog.js` + `tools/test_resolve_sync.js` | ✅ 15/15 + 10/10（含"审计造状态不许被引擎覆盖"） |
| 章节收束 | `tools/test_chapter_end.js` | ✅ 12/12（打通六关才出现「整章通关」，且只通 1-6 时不许出现） |
| 星是唯一进度货币 | `tools/test_stars.js` | ✅ 25/25（金币整个删干净：源码剥注释后零残骸、`__rap` 不导出、存档不写 `coins`；星仍是累计永久标记，重刷不翻倍、旧存档能迁移、分两次拿也算） |
| 失败归因具体化 | `tools/test_fail_culprit.js` | ✅ 13/13（"还剩 3 个沙袋没扔"，数量必须等于车上实际剩余） |
| 拖出网格=卸下 | `tools/test_drag_unequip.js` | ✅ 19/19（待使用 +n / 叠放 n 不许丢 / 被占格弹回不卸下 / 出网格才提示） |
| 撤销语义 | `tools/test_undo.js` | ✅ 21/21（回到上一步整张图纸；卸下/擦除/放置/换向都算一步；一笔擦除只记一步） |
| 静音开关 | `tools/test_mute.js` + `tools/probe_audio_env.js` | ✅ 22/22（第 59 轮：全作原先**一个静音/音量控件都没有**，且 `SFX` 三个发声点各自直连 `a.destination`，没有总增益可挂。现在先过一条 `master` 总线，再在每个发声函数开头判 `if (muted) return;` —— 静音时**根本不建振荡器**。这个改法不只为省开销：无头里 `AudioContext` 永远 `suspended`、`currentTime` 永远 0、`setTargetAtTime` 永远到不了目标值（`resume()` 的 promise 更是永不 settle，`probe_audio_resume.js` 因此挂死），所以"读增益是不是 0"会是一条永远为真的空断言；改成数**建了几个发声节点**之后，这条判据可以真的变红（短路掉那 4 处 `if (muted) return;`，`osc` 立刻 0→5）。入口三个：右上角钉住的钮（画在所有面板之后，欢迎页/选关页/暂停卡上都点得着）、键盘 M、`localStorage` 持久化） |
| 建造用地形预览条 | `tools/test_build_preview.js` + `tools/probe_build_view.js` + `tools/probe_build_space.js` | ✅ 41/41（第 60 轮：`buildCam()` 只覆盖起点前后 ±9.52 米，**六关终点旗全都在画面外**（6/6，`probe_build_view.js` 量的），玩家看不见自己要跑的地形。修法是顶部一条 `y=50..86` 的剖面（位置由 `probe_build_space.js` 扫出的唯一空档决定）。竖向**共用同一个比例尺**（满量程 10 m = 1-6 的崖），所以 1-3 只剩 1.9 px 高差 —— 按关卡自动归一化会把 1-3 画成一整条山，两种画法在同一关相差 14.4 倍，测试里自证了这一条。曲线来自 `RAP.makeTerrain` 的真 `surfaceY`，逐 2 px 采样，并把交给 `lineTo` 的坐标记进 `state.previewProfile` —— 判据核对画出来的那条线，不另算同名公式） |
| 气球沙袋的可见链路 | `tools/test_lift_ui.js` | ✅ 25/25（真鼠标点车身 / 徽标像素对照 / 终点高度提示） |
| 美术方案 | `docs/art-bible.md`（四层景深 + 6 个 3D 手段 + 调色板 + 零件语言） | ✅ |
| 官方素材目录 | `docs/art-catalog.md` + `docs/art/imageid-probe-{1,2}.png` | ✅ 实测：无场景素材，UI 图标可用 |
| Lua + 存档 | `main.lua` + `roll-away-pig.save.json` | ⬜ 下一步（步骤 5） |
| 技术架构 | `docs/tech-architecture.md` | ⬜ 随步骤 5 落地 |
| 真机交接 | `docs/device-handoff.md` | ⬜ 步骤 7 |

## 与 tumble-piggy 的关系

- **不复用代码**，但复用**已验证的平台事实**：图元映射、绘制顺序=创建顺序、按钮垫底、
  指针坐标 = `(设计x, 720-设计y)`、`click {name}` 驱动用例、`OnUpdate` 需显式 `EnableUpdate(true)`、
  文字需 `adaptiveFontSize`、`▶` 等字形缺失。
- 不复用它的 8×5 网格/12 零件/3 关数据——本作按 v1.0 的 6×8 网格与 9 零件重做。

## 下一步（步骤 5：Lua 实现）

HTML 版已经把**全部玩法规则**固定下来了（物理、浮力、三星、关卡数据、交互时序），
Lua 版的任务是"照合同搬实现"，不是重新设计。要搬的东西按风险从高到低排：

1. **先立三星存档结构**：`goals = {arrive, boxes, challenge}` 三个布尔标记，星数现算。
   不要存 `stars` 数字 —— HTML 版在 gdd §5.2 里就踩过这个坑（两处数字迟早漂）。
2. **固定步累加必须原样搬**：千星客户端是 30 fps，而物理是按 1/60 s 写的。
   HTML 版的做法是 `acc += dt; while (acc >= 1/60) { step(1/60); acc -= 1/60; }`，
   并且 `guard` 上限 8 步防止卡顿雪崩。这条在真机上要复验。
3. **点车身扎气球/扔沙袋**：真机上是**触屏**，判定是"世界坐标 0.85 m 内最近的可消耗件"。
   0.85 m ≈ 27 px（1.85 倍缩放），手指直径约 40 px —— 可能偏小，必须先实测再调。
   Lua 侧要拿到触点的**世界坐标**，也就是 `cursor` 区域的屏幕点 → 反算相机矩阵 → 世界点。
4. **四层景深控件池**：天空底 → 远景丛林 → 地形条带 → 前景；再用接触阴影 + 雾带补 3D 感。
   地形条带是**按列生成的一批矩形**，不是一张贴图（官方没有场景贴图，见 art-catalog.md）。
5. **UI 图标换官方 imageId**（对勾 101102 / 垃圾桶 101038 / 齿轮 105180 / 星级 104002）。
   注意 **imageId 只能在编辑期设置**，所以每种图标要单独一个模板控件。
6. **1-2 的标准解含"什么时候按打气筒"**，不是纯零件摆位。HTML 版为此加了
   `SPECS['1-2']._presses` + `launchSpec()`；Lua 版需要同样的注入口，
   否则"按一下"这条规则在真机上没法自动验。
7. **进度顺序**：先 1-1 跑通"建造 → 发射 → 结算 → 一秒重开"，再补 1-2…1-6。
   不要一次搬六关 —— 每一关都带着自己的 `hardCols` /`partsBox` / `challenge`，
   搬错一个字段的结果是"能玩但拿不到三星"，比崩还难查。

## 仍然成立的契约

9 个零件、6×8 建造区、1 格 = 1 m = 32 px、交互键上限 3（气球/沙袋不占）、三类动力源、能量预算、
浮力模型（净重 < 0 则定速上升 2.5 m/s）、终点高度门槛 2.2 m、
0.4 倍速回放 + 归因文字、一秒重开、关卡 JSON schema。

## 尚未闭环的四件事（如实记录）

1. **「不散架」这颗星在现有五关里几乎不会失败** —— 400 种随机造法只有 1% 撞碎木框。
   它是可达的（1-1 标准解三星），但还不够"值得追求"。需要一关专门为它设计（长下坡 + 落地）。
   第 37 轮补了气球/沙袋，**但这一关还没做**。第 45 轮把伤害门槛从 6 挪到 4.5
   （对齐分级接触反馈的 lvl 3），"掉过耐久"的随机造法从 13.8% 涨到约 27%，
   但**能通关的局里仍然很少受伤** —— 门槛救不了这颗星，只有关卡能救。
2. **1-6 只验证了"设计成立"，没验证"好玩"** —— 18 个断言证明可通、无解会失败、
   ±0.5 秒抖动不误杀，但"扔沙袋 → 升空 → 扎气球"的节奏必须由用户试玩判定。
3. ~~**金币没有消费出口**~~ —— 第 61 轮按用户裁定**整个删掉金币**，只留星。
   理由不是"不好看"，而是它本来就是一个没有出口的数字：结算卡上的 +180
   只是往一个永远花不出去的口袋里塞数。现在唯一会增长的是星（累计制永久标记），
   重刷只补没点亮的那几颗。后续做成就系统时直接挂在星上（"满星 6 关"已经是选关页的一条读数）。
4. **真机一行没跑过**。网页版手感只在 60 fps 浏览器里成立；千星客户端 30 fps + 固定步累加，
   步骤 6 必须复验，尤其是"按住蓄力"和"点车身扎气球"这两条时间/精度敏感手感。
   —— 后者在真机上是**触屏**，0.85 m 的判定半径够不够，只能实测。




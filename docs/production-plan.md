# 制作计划 · 滚蛋吧！猪（roll-away-pig）

## 当前状态

- 当前位置：**步骤 3（HTML 效果展示）已可玩、并已按参考重做一轮系统 → 下一步步骤 5（Lua 实现）**。
- 三个已拍板决定（用户 2026-04-19 确认，不再讨论）：
  1. 首版范围 = **1-1 ~ 1-5 垂直切片**（6 个零件）；
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
| 切片策划案 | `docs/gdd.md` | ✅ v0.2（三星累计制、1-1 不散架、1-2 终点与第三星修订） |
| 参考拆解 | `docs/reference-badpiggies.md` | ✅ 含来源标注、差距排序、落地记录 |
| 原稿全文 | `docs/source-gdd-v1.0.txt` + `reference/*.docx` | ✅ |
| 3-12 数据校验 | `docs/check-312.md` | ✅ 全绿（不进切片，备查） |
| 测试用例 | `tests/cases.md` + `tests/*.json`（15 个） | ✅ schema 自检通过 |
| 关卡数据 | `levels/01.json`…`05.json`（`tools/build_levels_js.js`） | ✅ 自洽校验通过 |
| HTML 效果展示 | `prototype/index.html` + `game.js` + `levels.js` + `README.md` | ✅ 可玩；**39 项自检全绿**（27 个交互脚本 + 12 个静态/度量尺自检） |
| 数值校核 | `prototype/check_html_logic.js`、`tools/check_inline_js.js` | ✅ 37/37 |
| 美术方案 | `docs/art-bible.md`（四层景深 + 6 个 3D 手段 + 调色板 + 零件语言） | ✅ |
| 官方素材目录 | `docs/art-catalog.md` + `docs/art/imageid-probe-{1,2}.png` | ✅ 实测：无场景素材，UI 图标可用 |
| Lua + 存档 | `main.lua` + `roll-away-pig.save.json` | ⬜ 下一步（步骤 5） |
| 技术架构 | `docs/tech-architecture.md` | ⬜ 随步骤 5 落地 |
| 真机交接 | `docs/device-handoff.md` | ⬜ 步骤 7 |

## 与 tumble-piggy 的关系

- **不复用代码**，但复用**已验证的平台事实**：图元映射、绘制顺序=创建顺序、按钮垫底、
  指针坐标 = `(设计x, 720-设计y)`、`click {name}` 驱动用例、`OnUpdate` 需显式 `EnableUpdate(true)`、
  文字需 `adaptiveFontSize`、`▶` 等字形缺失。
- 不复用它的 8×5 网格/12 零件/3 关数据——本作按 v1.0 的 6×8 网格与 6 零件重做。

## 下一步（步骤 5：Lua 实现）

1. 按 `docs/art-bible.md` 建**四层景深**的控件池：天空底（官方底纹或图元条带）→ 远景丛林 → 地形条带
   → 前景沙滩/海/浪；再用接触阴影 + 雾带补 3D 感。
2. UI 图标优先换官方 imageId（对勾 101102 / 垃圾桶 101038 / 木箱 105221 / 齿轮 105180 / 星级 104002）。
   注意 **imageId 只能编辑期设置**，所以每种图标要单独一个模板控件。
3. **三星存档结构必须先立**：`goals = {arrive, boxes, challenge}` 三个布尔标记，
   星数由标记现算；不要存 `stars` 数字 —— HTML 版就是这么改的（见 gdd §5.2），
   两处数字迟早会漂。
4. 先把 1-1 跑通（建造 → 发射 → 结算 → 一秒重开），再补 1-2~1-5。
5. **1-2 的标准解包含"什么时候按打气筒"**，不是纯零件摆位。HTML 版为此加了
   `SPECS['1-2']._presses` + `launchSpec()`；Lua 版需要同样的东西 —— 一个能按时注入
   `pressInteract` 的测试入口，否则"按一下"这条规则在真机上没法自动验。
6. 复用 tumble-piggy 已验证的管线：控件池 guid 实例化、`cursor` 区域点击、`click {name}` 跑用例、
   固定步累加、`SetAsFirstSibling` 垫按钮。

## 仍然成立的契约

6 个零件、6×8 建造区、1 格 = 1 m = 32 px、交互键上限 3、三类动力源、能量预算、
0.4 倍速回放 + 归因文字、一秒重开、关卡 JSON schema。

## 尚未闭环的三件事（如实记录）

1. **「不散架」这颗星在现有五关里几乎不会失败** —— 400 种随机造法只有 1% 撞碎木框。
   它是可达的（1-1 标准解三星），但还不够"值得追求"。需要一关专门为它设计（长下坡 + 落地）。
2. **金币没有消费出口**。参考里金币也不是直接商店货币（是星级/收集的副产物），
   所以不算缺陷，但闭环要等后续章节。
3. **真机一行没跑过**。网页版手感只在 60 fps 浏览器里成立；千星客户端 30 fps + 固定步累加，
   步骤 6 必须复验，尤其是"按住蓄力"这条时间敏感手感。




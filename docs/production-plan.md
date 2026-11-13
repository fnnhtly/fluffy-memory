# 制作计划 · 滚蛋吧！猪（roll-away-pig）

## 当前状态

- 当前步骤：**步骤 4 完成（美术方案 + 官方素材实测目录）→ 下一步步骤 5（Lua 实现）**。
- 三个已拍板决定（用户 2026-04-19 确认）：
  1. 首版范围 = **1-1 ~ 1-5 垂直切片**（6 个零件）；
  2. 屏幕 = **横屏 1280×720**（千星无竖屏画布）；
  3. 工程 = **新建 `workspace/roll-away-pig`，从零写**。
- 用户 2026-04-19 追加的美术方向：**画风结合——优先官方素材造景产生 3D 感，交互物与 UI 用图元**；
  随后进一步确认 **「更原神一点好」**（已定：深青天 + 暖金地平线 + 金绿草皮 + 官方图标 UI）。
- **实测结论（重要）**：官方 imageId 白名单共 33 个号段、约 1200 个 id，**全是原神 UI 图标/面板/铭牌/评级，
  没有任何地形/树/海/天空场景贴图**（证据 `docs/art/imageid-probe-1.png`、`imageid-probe-2.png`）。
  所以"官方素材造景"落地为：**官方底纹当背景层 + 图元分层造景**；官方素材真正的价值在 **UI 图标**。
- 本轮新增：
  - `docs/art-catalog.md`：imageId 可用性实测目录 + 场景/UI 的可用清单；
  - `docs/art-bible.md`：四层景深 + 6 个 3D 手段 + 调色板 + 零件图元语言 + HTML→千星映射；
  - HTML 演示已落地"3D 手段"：石墙上沿高光、远景雾带、车/箱接触阴影、远景压暗。
- **2026-04-19 追加设计变更**：用户要求「结构中空，让角色可以被放进去」→ 已实现：
  木框中空（四条边）、小猪变成内嵌件（只能放进已有木框的格子，`need_frame`）、框碎后猪裸露；
  连带修掉三个问题：车变重后磕台阶翻车（轮子力矩减半 + 角阻尼 2.6）、下坡后一直俯仰导致车头蹭地
  （贴地稳定器 + 角点摩擦减弱）、台阶磕碰三连扣血（猪受伤阈值 10 + 0.6s 冷却）。数值校核 **22/22 PASS**。
- 阻塞项：`docs/art-bible.md` 第八节三个确认项（方向是否认可 / 天空底用官方 107231 还是纯图元 / UI 是否全换官方图标）。

## 知识来源与可用性（PREFLIGHT，本轮复用 tumble-piggy 的结论并复核）

| 来源 | 工具/路径 | 文档与版本 | 适用范围 | 读取结果 |
|---|---|---|---|---|
| 千星官方客户端文档库 | `list_client_documents` / `get_client_document` | `客户端控件和客户端脚本`(mhbgxf0nynww)、`客户端控件API文档`(mhtakr07vej4)，crawledAt 2026-09-25 | 客户端 2D UI + Lua | 已取得：生命周期、`EnableUpdate`、`InstantiateClientUIControl`、控件字段/方法、`AddCursorEventListener`/`CursorEventData`、`AddKeyEventListener`、`showCursor`/`raycastTarget`、Lua 5.3 受限库 |
| 千星沙箱模拟器 | `qxqy_studio_get/patch/play/load/*_screenshot`、`qxqy_script_sync` | 当前会话可用 | 存档编辑、试玩、截图、脚本同步 | 已在 tumble-piggy 上实测（`pointer`/`click {name}`/`key` 注入规则、图元映射、绘制顺序=创建顺序） |
| 模拟器操作 Skill | `qxqy-simulator` | 会话内 | 存档格式、工具用法 | 已加载 |
| 策划案 v1.0 | 用户提供 `滚蛋吧猪_游戏策划案_v1.0.docx` | v1.0 立项稿 | 玩法语义 | 已全文提取：`docs/source-gdd-v1.0.txt`（463 行） |
| 附录 A/B 数据 | 自行校验脚本 `tools-docx/validate_312.py` | — | 3-12 关卡数据 | **自洽**：16×72、13 个喷火口坐标全对、2 条熔岩渠全对、S/E/B 与 JSON 一致（`docs/check-312.md`） |

已确认缺项：**无**（2D UI+Lua 所需官方接口齐备）。未使用 3D 节点图知识库。

## 产物与状态

| 产物 | 路径 | 状态 |
|---|---|---|
| 切片策划案 | `docs/gdd.md` | ✅ v0.1（含 5 关逐关配置、6 零件表、物理参数、三星规则、失败/重开、落地约束） |
| 原稿全文 | `docs/source-gdd-v1.0.txt` + `reference/*.docx` | ✅ |
| 3-12 数据校验 | `docs/check-312.md` | ✅ 全绿（不进切片，备查） |
| 测试用例 | `tests/cases.md` + `tests/*.json`（15 个） | ✅ schema 自检通过 |
| 关卡数据 | `levels/01.json`…`05.json`（`tools/make_levels.py`） | ✅ 自洽校验通过 |
| HTML 效果展示 | `prototype/index.html` + `game.js` + `levels.js` + `README.md` | ✅ 可玩；数值校核 18/18 |
| 数值校核 | `prototype/check_html_logic.js`、`tools/check_inline_js.js` | ✅ 复跑全绿 |
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
3. 先把 1-1 跑通（建造 → 发射 → 结算 → 一秒重开），再补 1-2~1-5。
4. 复用 tumble-piggy 已验证的管线：控件池 guid 实例化、`cursor` 区域点击、`click {name}` 跑用例、
   固定步累加、`SetAsFirstSibling` 垫按钮。

## 需要用户确认（美术方向三条）

1. 「图元分层 + 官方 UI 图标」这个组合方向是否认可？
2. 天空底：用官方 **107231（星空蓝紫底纹）** 还是保持黄绿渐变（纯图元）？
3. UI 图标是否全部换官方 imageId（对勾/垃圾桶/宝箱/齿轮/星级/评级）？




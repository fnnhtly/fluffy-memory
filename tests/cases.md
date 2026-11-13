# 滚蛋吧！猪 · TDD 用例（垂直切片 v0.1）

步骤 2 产物：规则 → 用例追踪 + `tests/*.json`（`qxqy-autotest` / `version: 1`）。
**本步骤不打开模拟器、不改存档、不跑 `runCase`**；有效的 TDD Red 要等步骤 5 的可运行骨架。

## 一、稳定日志词汇（Lua `print`，实现必须照此输出）

| 事件 | 格式 |
|---|---|
| 启动/状态 | `game_start` / `phase build|run|resolved` / `level <1..5>` |
| 放置 | `build_place part=<kind> cell=<r>,<c> left=<n>` |
| 移除/旋转 | `build_remove cell=<r>,<c>` / `build_rotate part=<kind> cell=<r>,<c> dir=<0-3>` |
| 拒绝放置 | `build_blocked reason=<budget|outside|connect|interact_limit>` |
| 发射 | `launch mass=<m> wheels=<n> parts=<n>` |
| 能量 | `motor_on` / `motor_out` / `energy <v>`（每秒最多一次） |
| 打气筒 | `pump_charge v=<x>` / `pump_release` / `pump_used` |
| 木箱 | `box 1` / `box 2` |
| 撞击/损伤 | `impact v=<x> at=<r>,<c>` / `part_broken part=<kind> at=<r>,<c>` / `pig_hurt hp=<n>` |
| 墙面 | `wall_hit v=<x>` |
| 通关/失败 | `win stars=<n> box=<n> energy=<e> time=<t>` / `fail <pig_dead|out_of_bounds|stuck|timeout>` |
| 结算与流程 | `phase resolved` / `restart` / `next_level <n>` |
| 交互键 | `interact_key n=<1..3> part=<kind>`（按下时） |

## 二、控件命名契约（步骤 5 必须一致，`runCase` 靠它定位）

| 控件 | 类型 | 说明 |
|---|---|---|
| `WorldRoot` | 容器 | 脚本挂载点 |
| `Cell_<r>_<c>` | 光标检测区域 | 6×8 = 48 格（r 0..7，c 0..5），r=0 在最上 |
| `Tray_wood_frame` `Tray_wood_wheel` `Tray_iron_wheel` `Tray_motor` `Tray_battery` `Tray_pump` `Tray_eraser` | 预设按钮 | 零件箱（本关没有的零件隐藏） |
| `LaunchButton` | 预设按钮 | 发射 |
| `ClearButton` | 预设按钮 | 一键清空 |
| `Interact_1` `Interact_2` `Interact_3` | 预设按钮 | 运行期交互键（≤3） |
| `RetryButton` `NextButton` | 预设按钮 | 结算：重试（保留方案）/ 下一关 |
| `UndoButton` | 预设按钮 | 撤销上一件（v1.0 §3.1：不做撤销栈） |
| `LevelTab_1` … `LevelTab_5` | 预设按钮 | 建造界面顶部关卡页签（实现期新增，见 GDD §3.2-9） |
| `HudInfo` | 文本框 | 总重 / 重心偏移 / 能量 / 星级 |

坐标约定：设计分辨率 1280×720；建造区 6 列 × 8 行，1 格 = 32 px；建造区左上角固定在 (352, 176)。

## 三、规则 → 用例追踪

| 用例 | CONTRACT | 动作 | 可观察结果 | 证据 |
|---|---|---|---|---|
| T01 boot | 状态机、1-1 可通 | 进入游戏 | `game_start`、`phase build`、`level 1`、`WorldRoot` 存在 | `tests/t01-boot.json` |
| T02 首关通关 | 建造 + 物理 + 胜负 | 木框 ×3（第 2 行连续 3 格）+ 木轮 ×2（第 3 行两端）→ 发射 | `launch mass≈4.8 wheels=2 parts=5` → `box 1` → `win stars=2` | `tests/t02-level1-win.json` |
| T03 预算 | 零件箱库存 | 1-1 连放 4 块木框（箱里 3） | 第 4 块 `build_blocked reason=budget`，`left=0` | `tests/t03-budget.json` |
| T04 无效车 | 失败判定 | 只放 2 块木框、不放轮子 → 发射 | 5 s 内 `fail stuck`（无位移），结算可见重试 | `tests/t04-stuck.json` |
| T05 交互键按下 | 交互件即键位 | 1-2 放打气筒 → 发射 → 点 `Interact_1` | `interact_key n=1 part=pump`、`pump_charge`/`pump_release`、`win stars=2`（木箱到手） | `tests/t05-pump.json` |
| T06 交互键不按 | ★★★ 挑战 | 1-2 放打气筒但全程不点 → 靠助跑上台阶 | `pump_used=0` → `win stars=3` | `tests/t06-pump-skip.json` |
| T07 交互键上限 | 交互件即键位（≤3） | 1-2 连放 4 个打气筒 | 第 4 个 `build_blocked reason=interact_limit`，`Interact_1..3` 存在、`Interact_4` 不存在 | `tests/t07-interact-limit.json` |
| T08 能量 | 能量预算 | 1-3 放马达 + 电池 → 发射跑到终点 | `motor_on`、`energy` 递减、`win stars=3 energy>=30` | `tests/t08-energy.json` |
| T09 能量耗尽 | 失败/边界 | 1-3 只放马达不放电池 → 发射 | 2 s 内 `motor_out`，之后 `fail stuck` 或超时 | `tests/t09-no-battery.json` |
| T10 冰面材质 | 材质即难度 | 1-4 用木轮跑冰面 | `wall_hit` 出现 → `win stars=1`（★★★ 未达成） | `tests/t10-ice-wood.json` |
| T11 铁轮 | 材质即难度 | 1-4 用铁轮跑冰面 | 无 `wall_hit` → `win stars=3` | `tests/t11-ice-iron.json` |
| T12 沟底木箱 | ★★ 与 ★★★ 冲突 | 1-5 用马达：下沟拿木箱再爬出 | `box 1` → `win stars=2` | `tests/t12-gully-box.json` |
| T13 禁用马达 | ★★★ | 1-5 不放马达：靠重力冲过沟 | `win stars=3` | `tests/t13-gully-no-motor.json` |
| T14 一秒重开 | 失败成本为零 | 1-1 结算 → 点 `RetryButton` | `restart`、`phase build`、**零件数不变**（方案保留）、`level 1` | `tests/t14-restart.json` |
| T15 跨关 | 关卡推进 | 1-1 通关 → 点 `NextButton` | `next_level 2`、`level 2`、建造区仍 6×8 | `tests/t15-next-level.json` |

> **跨关用例说明**：模拟器 `runCase` 不能设置脚本变量，所以 1-3/1-4/1-5 的用例要么先打穿前面几关
> （T08/T10/T12 写成"链式用例"，事件序列里包含前序关卡的通关），要么在真机用关卡选择。
> 步骤 5 会提供 `script:GetParam("startLevel")` 便于人工调试，但**用例不依赖它**。

## 四、静态检查（本步骤自查）

- [x] 每个 P0 规则至少一条用例（建造/预算/物理/胜负/三星/能量/材质/交互键/重开/跨关）。
- [x] 用例只按**控件名**点击，不含像素坐标；`dt = 1/30`。
- [x] 断言 kind ∈ `log|control|var|signal|tree|lua`；不用不存在的控件名。
- [x] ★★ 与 ★★★ 的冲突在 T12/T13 两条用例里体现（同一关两种解法）。
- [x] 失败四态中 `timeout` 只做实现，不单列用例（120 s 用例太长，改用真机人工验证）。

## 五、已知无法在本轮验证的规则

| 规则 | 原因 | 计划 |
|---|---|---|
| 交互键上限 3 的**运行期**表现（第 4 个按钮不出现） | 需要 4 个交互件同时存在，1-2 给 4 个打气筒即可构造 | T07 覆盖建造期拒绝；运行期按钮数量在步骤 6 用截图核对 |
| 失败回放（0.4× 3 s + 归因） | 需要真实失败瞬间的录像缓冲；用例只能断言 `fail` 原因 | 步骤 6 用截图 + 真机人工 |
| 一秒重开的**真实耗时** | 工具无法测墙钟时间 | 真机人工计时 |
| 手感（重力/扭矩/轮径） | 数值基线要在步骤 3 的 HTML 原型里调 | 步骤 3 |

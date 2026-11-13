import pathlib

q = pathlib.Path("records/playtest.md")
r = q.read_text(encoding="utf-8")
add = """## 2026-11-13 · 第 12 轮：关卡入场镜头 + 结算推镜（runtime=html，执行者：Agent）

参考视频里进入关卡时镜头是从全景推近的，我们原来是直接出现建造界面。

### 入场镜头（1.2 秒，ease-out cubic）

| 参数 | 全景（起点） | 建造（终点） |
|---|---|---|
| camera.x | 建造区 + 9 格 | 原地 |
| camera.y | + 3.2 | 原地 |
| zoom | **0.72**（广角） | 2.1 |
| UI 透明度 | 0（前 35% 完全不显示） | 1（70% 时完全显示） |

效果：进关先看到**整关的地形轮廓**（山坡、丛林、天空），再推近落到建造台，
UI 在推近过程中淡入 —— 这比"啪一下出现界面"更像成品游戏。

### 结算推镜（0.2 秒推近 12%）

进入结算时先推近再盖卡片，避免硬切。

### 验证

`tools/test_intro.js` 拍 4 帧：`in-00-start`（广角全景、无 UI）→ `in-01-mid` → `in-02-mid2` → `in-03-done`（建造界面）。
`introT` 最终 = 1.00 ✓，0 异常。

`shot-diff` 对比 pre-parts 基线：8/8 全部变化 ✓（改动确实生效）。
已用本轮结果建立新基线 `round12`，供下一轮对比。

回归：34/34 + **八个**自动化脚本 0 异常。

"""
marker = "## 已知弱点（如实记录）"
assert marker in r
r = r.replace(marker, add + marker)
q.write_text(r, encoding="utf-8")
print("记录已补")

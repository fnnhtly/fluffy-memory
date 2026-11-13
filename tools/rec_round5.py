import pathlib

q = pathlib.Path("records/playtest.md")
r = q.read_text(encoding="utf-8")
add = """## 2026-11-13 · 第 5 轮：5 套视觉地貌（runtime=html，执行者：Agent）

### 关键设计决定：视觉与物理解耦

关卡的 `materials`（mud 0.6 / stone 0.45 / ice 0.05）**决定摩擦系数**，改它会破坏 34/34 的可解性。
所以"看起来像洞窟/峡谷"这种纯美术需求，单独走一个 **`biome`** 字段，与物理彻底分离。

| 关 | biome | 视觉 |
|---|---|---|
| 1-1 | field | 明亮白天 + 绿丛林 + 亮绿草皮 |
| 1-2 | canyon | **暖橙岩壁 + 土黄草 + 赭色远山 + 暖白天空** |
| 1-3 | cave | **暗色天顶 + 顶部钟乳石剪影 + 深青岩 + 苔绿草 + 强暗角** |
| 1-4 | ice | 冷蓝 + 雪白草 + 淡蓝远山 |
| 1-5 | dusk | **紫橙天 + 暗紫山 + 暖棕地** |

### 修掉的两个真 bug

1. **TDZ 崩溃**：`PAL / CAVE` 声明在天空绘制**之后**，而天空第 587 行就要用 `CAVE` →
   `Cannot access 'CAVE' before initialization` → 整帧渲染失败（渲染安全网接住，画面空白）。
   修法：把 BIOMES/PAL/CAVE 声明挪到 `drawWorld` 最前面。
   这已经是**第二次**同类问题（上次是箭头里的 `ca`），说明前置声明要养成习惯。
2. **两处远山代码**：第一处已改用 `PAL.hill`，第二处仍写死 `COL.hillFar`（蓝色）→
   峡谷关远山还是蓝的。已统一。

### 截图脚本的坑
`startLevel()` 会重开欢迎页，导致截图全是引导遮罩。修法：调 `startLevel` 后立刻把
`welcome / levelSelect / helpOpen` 置 0 再截图。

回归：34/34 + 六个脚本 0 异常。截图：`records/shots/biome-{1..5}-{field,canyon,cave,ice,dusk}.png`

"""
marker = "## 已知弱点（如实记录）"
assert marker in r
r = r.replace(marker, add + marker)
q.write_text(r, encoding="utf-8")
print("记录已补")

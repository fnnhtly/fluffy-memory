import pathlib

q = pathlib.Path("records/playtest.md")
r = q.read_text(encoding="utf-8")
add = """## 2026-11-13 · 第 11 轮：渲染自检工具 + 零件厚重感（runtime=html，执行者：Agent）

### 新增工具：`tools/shot-diff.mjs`（防"改了没生效"）

上一轮连踩三次"改了但没生效"，所以做了个哈希对比工具：

```bash
node tools/shot-diff.mjs snapshot pre-parts   # 记下 8 张验证图的哈希
# ...改渲染代码、重新生成截图...
node tools/shot-diff.mjs compare pre-parts    # 哪些图没变化 → 警告
```

覆盖 8 张关键验证图：5 张 biome、选关页、结算页、撞击页。
未变化的图会标 ⚠ 并提示"对应改动可能没生效"，退出码 2。

**本轮用它验证：8/8 全部变化 ✓** —— 说明零件改动确实渲染出来了。

### 零件厚重感

参考视频里的木框和轮子有"厚木板/厚轮子"的体积，不只是平面。

| 部位 | 改动 |
|---|---|
| **所有零件** | 加**自身投影**（偏移 6%/8%、透明度 0.22），制造离地感 |
| **木框** | 内壁阴影从 1 层加到 **2 层**（外圈 0.55 / 内圈 0.45），凹进去的深度更明显 |
| **轮子** | 加**外缘暗描边**（圆柱侧壁）+ **内侧亮环**（受光的圆柱内壁） |

冰原关截图对比：木框有明确的内壁深度、铁轮有圆柱体积感。

回归：34/34 + 七个脚本 0 异常。

"""
marker = "## 已知弱点（如实记录）"
assert marker in r
r = r.replace(marker, add + marker)
q.write_text(r, encoding="utf-8")
print("记录已补")

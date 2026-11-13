import pathlib

q = pathlib.Path("records/playtest.md")
r = q.read_text(encoding="utf-8")
add = """## 2026-11-13 · 第 8 轮：装饰层跟随可视宽度（runtime=html，执行者：Agent）

第 7 轮把画布和 HUD 适配了，但**装饰层还写死 DW**，导致宽屏（21:9）两侧露空天空。

### 逐个修掉 7 处写死 DW 的地方

| 层 | 之前 | 现在 |
|---|---|---|
| 石头纹理 | `colsN = ceil(DW / stoneW)` | **`ceil((VIEW_W + 2*VIEW_OFF_X) / stoneW)`**，起始左移 `-VIEW_OFF_X` |
| 丛林冠 | `n = ceil(DW / r0*1.5)` | 按可视宽度算，起始左移 |
| 远山 | `for i < 7`，固定 7 座 | 按可视宽度算数量，起始左移 |
| 钟乳石（洞窟） | `for ci < 14` | 按可视宽度算数量，起始左移 |
| 远景地面矩形 | `fillRect(0, y, DW, h)` | `fillRect(-VIEW_OFF_X-4, y, VIEW_W+2*VIEW_OFF_X+8, h)` |
| 泥地过渡带 | 同上 | 同上 |
| 雾带 | 同上 | 同上 |
| 云 | 固定 4 团 | 宽屏时**额外补 2 团**在左右扩展区 |

### 验证

21:9（2100×900）截图：丛林、远山、石头纹理、云全部铺满全宽，无空区、无黑边。
34/34 + 七个脚本 0 异常。

"""
marker = "## 已知弱点（如实记录）"
assert marker in r
r = r.replace(marker, add + marker)
q.write_text(r, encoding="utf-8")
print("记录已补")

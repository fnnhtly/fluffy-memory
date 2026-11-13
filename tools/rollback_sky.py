"""回滚本轮的离屏缓存重构，恢复 drawWorld 为直接绘制。

保留两个安全的优化：
1. 地形缓存（makeTerrain 只跑一次）
2. 石头尺寸 108×72 + DPR ≤ 1.5
3. 去掉每块石头的受光边

去掉：离屏 canvas（ctx 切换导致 save/restore 栈错乱、HUD 透明、hash 作用域问题）。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 1) 删除天空缓存块，恢复原始绘制
sky_start = t.find("    // ---------- 天空/远山/丛林（离屏缓存）----------")
assert sky_start > 0, "sky cache not found"
sky_end = t.find("    // ---------- 石块层（离屏缓存", sky_start)
assert sky_end > sky_start

# 从缓存块里救出原始绘制代码（在 "ctx.setTransform(sx2, 0, 0, sy2, ..." 之后到 "ctx.globalAlpha = 1;\n        ctx = savedCtx2;" 之前）
body_start = t.find("        ctx.setTransform(sx2, 0, 0, sy2, VIEW_OFF_X * sx2, VIEW_OFF_Y * sy2);", sky_start)
assert body_start > sky_start
body_start = t.find("\n", body_start) + 1
body_end = t.find("        ctx.globalAlpha = 1;\n        ctx = savedCtx2;", body_start)
assert body_end > body_start
sky_body = t[body_start:body_end]

t = t[:sky_start] + sky_body + t[sky_end:]

p.write_text(t, encoding="utf-8")
print("天空块已还原为直接绘制")

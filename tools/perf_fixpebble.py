"""把小碎石绘制移进石头缓存块内（它使用的 hash 定义在块内）。

小碎石本来就是"石头表面纹理"的一部分，跟石头一起缓存反而更合理。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 1) 抠出小碎石段
start = t.find("    // 石头表面的小碎石")
assert start > 0, "pebble block not found"
end = t.find("    // 地表材质带", start)
assert end > start, "pebble end not found"
pebble = t[start:end]
t = t[:start] + t[end:]
print("小碎石段行数:", pebble.count("\n"))

# 2) 找石头缓存块的结束（ctx.drawImage(stoneLayer ...) 之前）
anchor = "      ctx.drawImage(stoneLayer, -VIEW_OFF_X, -VIEW_OFF_Y, VIEW_W, VIEW_H);"
assert anchor in t, "drawImage anchor not found"
idx = t.find(anchor)
# 回退到该行之前，找最近的 "ctx = savedCtx;"（缓存绘制结束）
save_line = t.rfind("        ctx = savedCtx;", 0, idx)
assert save_line > 0, "savedCtx restore not found"

# 插到 restore 之前
t = t[:save_line] + pebble.rstrip() + "\n" + t[save_line:]
p.write_text(t, encoding="utf-8")
print("小碎石已移入石头缓存块")

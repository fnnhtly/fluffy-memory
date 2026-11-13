"""把 BIOMES / PAL / CAVE 的声明挪到 drawWorld 最前面（现在在天空之后才声明，
而天空第 587 行就要用 CAVE → TDZ 报错，整帧渲染失败）。

做法：删掉原位置的声明块，插到 drawWorld 开头（const s = PPM * cam.zoom 之后）。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 1) 抠出声明块
start = t.find("    // ---------- 按关卡 biome 选视觉地貌（纯美术，不影响物理）----------")
assert start > 0, "biome block not found"
end = t.find("    const CAVE = PAL.cave;", start)
assert end > start
end = t.find("\n", end) + 1
block = t[start:end]
t = t[:start] + t[end:]

# 2) 插到 drawWorld 开头（在 const toY 之后）
anchor = "    const toY = wy => DH / 2 - (wy - cam.y) * s;"
assert anchor in t, "drawWorld anchor missing"
t = t.replace(anchor, anchor + "\n\n" + block, 1)

p.write_text(t, encoding="utf-8")
print("声明已前置")

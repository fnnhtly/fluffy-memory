"""地形缓存（按行号精确定位）。"""
import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

p = pathlib.Path("prototype/index.html")
lines = p.read_text(encoding="utf-8").split("\n")

# 找所有 makeTerrain 行
idx = [i for i, ln in enumerate(lines) if "RAP.makeTerrain(level())" in ln]
print("makeTerrain 行:", [i + 1 for i in idx])
assert len(idx) >= 2, "need at least 2 occurrences"
target = idx[1]     # frameBody 里的那个

indent = "      "
new_lines = [
    indent + "// 地形缓存：同一关不重复重建（每帧重建要跑 3 遍高斯平滑，很贵）",
    indent + "if (terrainCacheId !== level().levelId || !terrainCache) {",
    indent + "  terrainCache = RAP.makeTerrain(level());",
    indent + "  terrainCacheId = level().levelId;",
    indent + "}",
    indent + "const ter = terrainCache;",
]
lines[target:target + 1] = new_lines

# 加缓存变量声明
for i, ln in enumerate(lines):
    if "const stoneLayer = document.createElement" in ln:
        lines.insert(i, "  let terrainCache = null, terrainCacheId = '';")
        print("缓存声明插在行", i + 1)
        break

p.write_text("\n".join(lines), encoding="utf-8")
print("地形缓存已插入")

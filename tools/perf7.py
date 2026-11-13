"""缓存地形：地形只依赖 level，关卡不变就不用重建。

现在 frameBody 里每帧调 RAP.makeTerrain(level())，里面要：
- 逐列扫 mapRows（40 列 × 14 行）
- 3 次高斯平滑（40 列 × 3 遍 × 5 核）
每帧都做一遍，纯浪费。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 1) 加地形缓存
anchor = "  // ---------- 离屏缓存画布（性能：静态层不每帧重画）----------"
assert anchor in t
cache = """  // ---------- 地形缓存（关卡不变就不重建） ----------
  let terrainCache = null, terrainCacheId = '';

""" + anchor
t = t.replace(anchor, cache, 1)

# 2) frameBody 里改用缓存
old = "      const ter = RAP.makeTerrain(level());"
# 只替换第二个（frameBody 里的）
first = t.find(old)
second = t.find(old, first + 1)
assert second > first, "frameBody makeTerrain not found"
new = """      // 地形缓存：同一关不重复重建（每帧重建要跑 3 遍高斯平滑，很贵）
      {
        const lid = level().levelId;
        if (terrainCacheId !== lid || !terrainCache) {
          terrainCache = RAP.makeTerrain(level());
          terrainCacheId = lid;
        }
      }
      const ter = terrainCache;"""
t = t[:second] + new + t[second + len(old):]
p.write_text(t, encoding="utf-8")
print("地形缓存已加")

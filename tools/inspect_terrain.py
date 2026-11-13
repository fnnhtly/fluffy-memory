"""根因确认 + 解决方案。

**根因**：地形高度场做了 3 次 5 点高斯平滑（第 3 轮为了让车能爬上坡），
把 1 米台阶抹成 0.2 米缓坡（斜率 0.07 ≈ 4°）→ 轮子法向速度远小于 6 m/s → 永不触发撞击。

**解决**：加一个"硬台阶"机制 —— 地形生成时允许标注某些列**跳过平滑**，
保持原始高度（真正的垂直墙面）。这样：
- 普通地形仍然平滑（车能爬上坡）
- 标注为硬的列形成真·台阶（车会撞）

这是关卡数据层的能力，物理不变。
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")

# 找 makeTerrain 里的平滑段
import re
i = s.find("function makeTerrain")
j = s.find("function ", i + 20)
seg = s[i:j]
print("--- makeTerrain 段长度:", len(seg))
print(seg[:1200])

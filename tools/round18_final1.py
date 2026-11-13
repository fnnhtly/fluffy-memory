"""1-1 最终地形：
  col 0..15   高台（地表 row 7）
  col 16      硬落差 1 米 → row 8
  col 17..30  持续下坡：每 2 格降 1 格（18°），给撞击后的车继续加速
  终点放在下坡中段
"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

old = '''# 中段：先抬 1 格（硬台阶，车会撞）再缓缓下降回平地
# 起始高台（col 0..15，高 1 格）→ col16 硬落差 1 米 → 长下坡
for _c in range(0, 16):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"
for _c in range(16, cols):
    _top = min(8, 7 + (_c - 15))
    for _r in range(_top, ROWS):
        rows[_r][_c] = "#"'''
new = '''# 起始高台（col 0..15，地表 row 7）→ col16 硬落差 1 米 → 之后持续下坡
for _c in range(0, 16):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"
for _c in range(16, cols):
    _top = min(ROWS - 3, 8 + (_c - 16) // 2)     # 每 2 格降 1 格（18° 下坡）
    for _r in range(_top, ROWS):
        rows[_r][_c] = "#"'''
assert old in t, "1-1 terrain block not found"
t = t.replace(old, new)
p.write_text(t, encoding="utf-8")
print("1-1 改成持续下坡")

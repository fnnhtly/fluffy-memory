"""正解：1-1 改成"起始高台 → 垂直下坠 1 米 → 长下坡"。
不要上台阶（车爬不上去），只要下坠。
"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

old = '''# 平台 → 硬落差 → **长下坡**（撞击后顺坡继续加速）
for _c in range(12, 17):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"
for _c in range(17, cols):
    _top = min(8, 8 + (_c - 16))
    for _r in range(_top, ROWS):
        rows[_r][_c] = "#"'''
new = '''# 起始高台（col 0..15，高 1 格）→ col16 硬落差 1 米 → 长下坡
for _c in range(0, 16):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"
for _c in range(16, cols):
    _top = min(8, 7 + (_c - 15))
    for _r in range(_top, ROWS):
        rows[_r][_c] = "#"'''
if old in t:
    t = t.replace(old, new)
    print("  ok: 起始高台 + 下坠")

# hardCols 改成 15,16（落差两端）
t = t.replace('"hardCols": [16, 17],', '"hardCols": [15, 16],')
# 起点要在高台上
t = t.replace('put(rows, 1, 4, "S")', 'put(rows, 3, 7, "S")')
p.write_text(t, encoding="utf-8")
print("done")

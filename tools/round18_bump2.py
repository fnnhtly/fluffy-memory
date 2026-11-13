"""给 1-1 加短坎（用 ASCII 锚点）。"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

anchor = 'put(rows, 24, 7, "B")\nlevels.append({'
assert anchor in t, "1-1 anchor not found"

new = '''put(rows, 24, 7, "B")
# 平地中段一道 1 格高的短坎（45°）：车会弹一下，触发出撞击演出
for _c in range(14, 16):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"
levels.append({'''
t = t.replace(anchor, new, 1)
p.write_text(t, encoding="utf-8")
print("1-1 短坎已加")

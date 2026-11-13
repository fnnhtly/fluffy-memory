"""1-1 改成"1 格台阶 + 后接下坡"：既触发撞击演出，又能通关。

实测数据：
- 1 格台阶 + 平地：impacts=0（太缓，滚过去没感觉）
- 1 格台阶 + 下坡：impacts=4，x=25.6（几乎到终点 26，只差 0.4）

只要把终点从 26 调到 25 就能通关，同时保住撞击演出。
"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

anchor = '''# 平地中段一道 1 格高的短坎（45°）：车会弹一下，触发出撞击演出
for _c in range(14, 16):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"'''
assert anchor in t, "bump anchor not found"

new = '''# 中段一道 1 格台阶 + 后接缓下坡：车会弹一下（触发撞击演出）再顺坡下去
for _c in range(14, 17):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"
for _c in range(17, 24):
    _top = min(8, 8 + (_c - 16))
    for _r in range(_top, ROWS):
        rows[_r][_c] = "#"'''
t = t.replace(anchor, new, 1)

# 终点 26 → 25
t = t.replace('put(rows, 26, 7, "E")', 'put(rows, 25, 7, "E")')
t = t.replace('"goal": {"col": 26, "row": 7},', '"goal": {"col": 25, "row": 7},')
p.write_text(t, encoding="utf-8")
print("1-1 已改成台阶+下坡")

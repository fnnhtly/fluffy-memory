"""务实方案：1-1 恢复成能通关的平缓地形，但保留"颠簸"（0.5 米半格硬坎）。

实测：
- 1 米落差 → 撞击演出触发（vn 9.4），但车失速停住，过不了
- 0.5 米半格 → 不触发撞击（vn < 6），但车能过

所以 1-1 用**半格颠簸**（保证通关），把"撞击演出"留给后面有马达的关卡。
1-1 的教学目标是"放个轮子"，不该被撞击打断。

最终：1-1 恢复缓坡下山 + 终点前一道半格坎（视觉上有起伏，物理上不卡）。
"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

old = '''# 起始高台（col 0..15，地表 row 7）→ col16 硬落差 1 米 → 之后持续下坡
for _c in range(0, 16):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"
for _c in range(16, cols):
    _top = min(ROWS - 3, 8 + (_c - 16) // 2)     # 每 2 格降 1 格（18° 下坡）
    for _r in range(_top, ROWS):
        rows[_r][_c] = "#"'''
new = '''# 缓坡下山（能通关）；col 18..20 半格小坎（视觉起伏，不会卡住）
for _c in range(0, 14):
    for _r in range(5, ROWS):
        rows[_r][_c] = "#"
for _c in range(14, cols):
    _top = min(ROWS - 3, 6 + (_c - 13) // 2)
    for _r in range(_top, ROWS):
        rows[_r][_c] = "#"
for _c in range(18, 21):
    rows[7][_c] = "@"        # 半格小坎'''
assert old in t, "1-1 terrain not found"
t = t.replace(old, new)

# hardCols 清空（1-1 不再需要硬台阶）
t = t.replace('"hardCols": [15, 16],\n', '')
# 起点终点复位
t = t.replace('put(rows, 3, 7, "S")', 'put(rows, 1, 4, "S")')
t = t.replace('put(rows, 30, 7, "E")', 'put(rows, 25, 7, "E")')
t = t.replace('"goal": {"col": 30, "row": 7},', '"goal": {"col": 25, "row": 7},')
t = t.replace('put(rows, 24, 7, "B")', 'put(rows, 22, 7, "B")')
t = t.replace('"boxes": [{"col": 24, "row": 7}]', '"boxes": [{"col": 22, "row": 7}]')
p.write_text(t, encoding="utf-8")
print("1-1 恢复缓坡 + 半格小坎")

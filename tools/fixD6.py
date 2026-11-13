"""定案：地面摩擦 3.0（明显粘），并把 1-1 / 1-2 / 1-5 从"攒惯性"改成**持续下坡**
（这样任何摩擦值下都能走，不再依赖动量）。
"""
import pathlib

# ---------- 1) 摩擦默认 3.0 ----------
g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")
s = s.replace("    groundFriction: 4.0,", "    groundFriction: 3.0,")
g.write_text(s, encoding="utf-8")
print("groundFriction = 3.0")

# ---------- 2) 三关改成持续下坡 ----------
p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

# 1-1：整关缓降（每 3 格抬 1 格 → 约 18°）
old11 = '''cols = 40
rows = blank(cols)
ramp_start(rows, cols, high_row=5, flat_row=FLOOR, ramp_cols=12)
put(rows, 1, 4, "S")                  # 出生在坡顶（地表 row 5）
put(rows, 27, 7, "E")
put(rows, 24, 7, "B")'''
new11 = '''cols = 40
rows = blank(cols)
# 整关持续缓降：从 row 4 一路降到 row 8（每 3 格降 1 格 ≈ 18°）
for c in range(cols):
    top = min(FLOOR, 4 + c // 3)
    for r in range(top, ROWS):
        rows[r][c] = "#"
put(rows, 1, 3, "S")
put(rows, 27, 7, "E")
put(rows, 24, 7, "B")'''
assert old11 in t, "1-1 block"
t = t.replace(old11, new11)

# 1-2：先有一段缓降，再一道 1 m 台阶
old12 = '''for c in range(9, cols):
    top = 7 if c >= 11 else 8 - (c - 8) // 2
    for r in range(top, ROWS):
        rows[r][c] = "#"                # col 9..10 抬 1 m，之后平地
put(rows, 1, 4, "S")
put(rows, 12, 6, "E")
put(rows, 8, 6, "B")'''
new12 = '''# 持续缓降（每 4 格降 1 格），col 11 起是一段 1 m 的小台阶再继续降
for c in range(cols):
    base = 4 + c // 4
    if c >= 11:
        base = min(FLOOR, base + 1)
    top = min(FLOOR, base)
    for r in range(top, ROWS):
        rows[r][c] = "#"
put(rows, 1, 3, "S")
put(rows, 14, 7, "E")
put(rows, 8, 6, "B")'''
assert old12 in t, "1-2 block"
t = t.replace(old12, new12)
t = t.replace('"goal": {"col": 12, "row": 6},', '"goal": {"col": 14, "row": 7},')

# 1-5：缓降 + 沟
old15 = '''ramp_start(rows, cols, high_row=5, flat_row=FLOOR, ramp_cols=12)
put(rows, 1, 4, "S")'''
new15 = '''# 持续缓降
for c in range(cols):
    top = min(FLOOR, 4 + c // 4)
    for r in range(top, ROWS):
        rows[r][c] = "#"
put(rows, 1, 3, "S")'''
if old15 in t:
    t = t.replace(old15, new15)

p.write_text(t, encoding="utf-8")
print("1-1 / 1-2 / 1-5 改成持续下坡")

"""三关改成持续下坡（只用 ASCII 锚点匹配，避开中文注释）。"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

# ---- 1-1 ----
old = '''ramp_start(rows, cols, high_row=5, flat_row=FLOOR, ramp_cols=12)
put(rows, 1, 4, "S")'''
new = '''for c in range(cols):
    top = min(FLOOR, 4 + c // 3)
    for r in range(top, ROWS):
        rows[r][c] = "#"
put(rows, 1, 3, "S")'''
assert old in t, "1-1 anchor"
t = t.replace(old, new, 1)
print("1-1 -> continuous slope")

# ---- 1-2 ----
old2 = '''for c in range(9, cols):
    top = 7 if c >= 11 else 8 - (c - 8) // 2
    for r in range(top, ROWS):
        rows[r][c] = "#"'''
new2 = '''for c in range(cols):
    base = 4 + c // 4
    if c >= 11:
        base = min(FLOOR, base + 1)
    top = min(FLOOR, base)
    for r in range(top, ROWS):
        rows[r][c] = "#"'''
assert old2 in t, "1-2 anchor"
t = t.replace(old2, new2, 1)
t = t.replace('put(rows, 1, 4, "S")', 'put(rows, 1, 3, "S")', 1)
t = t.replace('put(rows, 12, 6, "E")', 'put(rows, 14, 7, "E")', 1)
t = t.replace('"goal": {"col": 12, "row": 6},', '"goal": {"col": 14, "row": 7},', 1)
print("1-2 -> continuous slope")

# ---- 1-5 ----
old5 = '''ramp_start(rows, cols, high_row=5, flat_row=FLOOR, ramp_cols=12)
put(rows, 1, 4, "S")'''
if old5 in t:
    new5 = '''for c in range(cols):
    top = min(FLOOR, 4 + c // 4)
    for r in range(top, ROWS):
        rows[r][c] = "#"
put(rows, 1, 3, "S")'''
    t = t.replace(old5, new5, 1)
    print("1-5 -> continuous slope")
else:
    print("!! 1-5 anchor missing (check manually)")

p.write_text(t, encoding="utf-8")
print("done")

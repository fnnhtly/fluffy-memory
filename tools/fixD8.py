"""回滚地形改动，恢复 34/34 的关卡，并把"地面摩擦"交给用户调。

物理事实：木框静摩擦 μ≈0.55 → 静摩擦角 ≈ 29°。
比 29° 缓的坡，车在物理上就不该自己往下溜。所以"高摩擦"和"靠缓坡溜下去"
在原理上互斥，只能二选一。
"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

# ---- 1-1 回滚 ----
old = '''for c in range(cols):
    top = min(FLOOR, 4 + c // 3)
    for r in range(top, ROWS):
        rows[r][c] = "#"
put(rows, 1, 3, "S")'''
new = '''ramp_start(rows, cols, high_row=5, flat_row=FLOOR, ramp_cols=12)
put(rows, 1, 4, "S")'''
assert old in t
t = t.replace(old, new, 1)

# ---- 1-2 回滚 ----
old2 = '''for c in range(cols):
    base = 4 + c // 4
    if c >= 11:
        base = min(FLOOR, base + 1)
    top = min(FLOOR, base)
    for r in range(top, ROWS):
        rows[r][c] = "#"'''
new2 = '''for c in range(9, cols):
    top = 7 if c >= 11 else 8 - (c - 8) // 2
    for r in range(top, ROWS):
        rows[r][c] = "#"'''
assert old2 in t
t = t.replace(old2, new2, 1)
t = t.replace('put(rows, 1, 3, "S")\nput(rows, 14, 7, "E")', 'put(rows, 1, 4, "S")\nput(rows, 14, 7, "E")', 1)

p.write_text(t, encoding="utf-8")
print("地形回滚")

# ---- 摩擦默认 0（= 关闭整车摩擦），保留可调 ----
g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")
s = s.replace("    groundFriction: 3.0,", "    groundFriction: 0.0,")
g.write_text(s, encoding="utf-8")
print("groundFriction 默认 0（可调）")

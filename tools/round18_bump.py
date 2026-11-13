"""给关卡加"可撞的台阶/落差"，让演出有机会触发。

不改材质（不破坏 34/34 的摩擦约束），只是在地形里放**更陡的短台阶**：
现在的台阶都是 1:3 斜坡（18°），车能平滑滚过；改成 **1:1 短坎**（45°）就会真撞。

放在每个关卡"不影响解"的位置：
- 1-1：平地中段加一个 1 格高的短坎（车能过，但会弹一下）
- 1-3：平地中段加两个小坑洼
"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

# 1-1：在 col 14~15 加一个 1 格高的短坎（1:1）
old1 = '''put(rows, 1, 4, "S")                  # 出生在坡顶（地表 row 5）
put(rows, 26, 7, "E")
put(rows, 24, 7, "B")'''
new1 = '''put(rows, 1, 4, "S")                  # 出生在坡顶（地表 row 5）
put(rows, 26, 7, "E")
put(rows, 24, 7, "B")
# 平地中段加一道 1 格高的短坎（45°，车会弹一下 → 触发出撞击演出）
for c in range(14, 16):
    for r in range(7, ROWS):
        rows[r][c] = "#"'''
if old1 in t:
    t = t.replace(old1, new1)
    print("  ok: 1-1 加短坎")

p.write_text(t, encoding="utf-8")
print("done")

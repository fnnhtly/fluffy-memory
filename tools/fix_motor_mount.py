"""修"马达悬在车顶"：把马达从 (3,x) 悬空位置改成贴在木框上/下的正确位置。

问题：`motor: [[3, 2]]` 在第 3 行，而木框在第 4 行。物理上"贴着下面一格"算合法，
但视觉上马达就浮在车顶上方一格，像悬空。

改法：马达放到**第 4 行相邻格**（和木框同一行），或第 5 行（轮子那一行）。
1-3 有 4 格木框占 (4,1)..(4,4)，所以马达放 (4,0)（木框左边）最自然。
1-4 同理。1-5 木框在 (4,0)..(4,3)，马达放 (4,4)。
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")

pairs = [
    ("wood_wheel: [[5, 1], [5, 4]], motor: [[3, 2]], battery: [[4, 3]], pig: [[4, 2]] }",
     "wood_wheel: [[5, 1], [5, 4]], motor: [[4, 0]], battery: [[4, 3]], pig: [[4, 2]] }"),
    ("iron_wheel: [[5, 1], [5, 4]], motor: [[3, 2]], battery: [[4, 3]], pig: [[4, 2]] }",
     "iron_wheel: [[5, 1], [5, 4]], motor: [[4, 0]], battery: [[4, 3]], pig: [[4, 2]] }"),
    ("wood_wheel: [[5, 0], [5, 3]], motor: [[3, 1]], pig: [[4, 1]] }",
     "wood_wheel: [[5, 0], [5, 3]], motor: [[4, 4]], pig: [[4, 1]] }"),
]
for a, b in pairs:
    if a in s:
        s = s.replace(a, b)
        print("  ok:", b[:60])
g.write_text(s, encoding="utf-8")

# 用例同步
c = pathlib.Path("tools/make_cases.py")
t = c.read_text(encoding="utf-8")
t = t.replace("L3_MOTOR = [(3, 2)]", "L3_MOTOR = [(4, 0)]")
t = t.replace("L4_MOTOR = [(3, 2)]", "L4_MOTOR = [(4, 0)]")
c.write_text(t, encoding="utf-8")
print("cases 同步")

# 1-5 马达在 SPECS 里
g2 = pathlib.Path("prototype/game.js")
s2 = g2.read_text(encoding="utf-8")
s2 = s2.replace("wood_wheel: [[5, 0], [5, 3]], motor: [[3, 1]], pig: [[4, 1]] }",
                "wood_wheel: [[5, 0], [5, 3]], motor: [[4, 4]], pig: [[4, 1]] }")
g2.write_text(s2, encoding="utf-8")
print("done")

"""1-2 重排成"短关 + 终点前一道 1 m 台阶"（摩擦变大后原来的长距离滑行不成立了）：
  col 0..5 起步下坡 → 平地（木箱在 8）→ col 9..10 抬 1 m → 平地 → 终点 12
"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

# 找到 1-2 的地形生成段并替换
old = '''for c in range(15, cols):
    top = 7 if c >= 18 else 8 - (c - 14) // 3
    for r in range(top, ROWS):
        rows[r][c] = "#"                # col 15..17 抬 1 m（1:3 斜坡），之后平地
put(rows, 1, 4, "S")
put(rows, 12, 6, "E")
put(rows, 10, 6, "B")'''
new = '''for c in range(9, cols):
    top = 7 if c >= 11 else 8 - (c - 8) // 2
    for r in range(top, ROWS):
        rows[r][c] = "#"                # col 9..10 抬 1 m，之后平地
put(rows, 1, 4, "S")
put(rows, 12, 6, "E")
put(rows, 8, 6, "B")'''
assert old in t, "1-2 terrain block not found"
t = t.replace(old, new)
t = t.replace('"boxes": [{"col": 10, "row": 6}],', '"boxes": [{"col": 8, "row": 6}],')
p.write_text(t, encoding="utf-8")
print("1-2 rebuilt")

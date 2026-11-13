"""让地形支持"半格台阶"：用 mapRows 里的 '@' 表示"这一列地表在格子中线"。

这样就能做 0.5 米高的硬台阶 —— 车会撞一下（触发演出）但能过去。
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")

# 1) rawH 计算时，'@' 列取 rows - topRow - 0.5
old = "    for (var i0 = 0; i0 < cols; i0++) rawH[i0] = rows - topRow[i0];"
new = ("    for (var i0 = 0; i0 < cols; i0++) {\n"
       "      rawH[i0] = rows - topRow[i0];\n"
       "      // '@' = 半格台阶：地表比整格高 0.5 米\n"
       "      if (topRow[i0] < rows && map[topRow[i0]][i0] === '@') rawH[i0] -= 0.5;\n"
       "    }")
assert old in s, "rawH line not found"
s = s.replace(old, new, 1)

# 2) 让 '@' 也算实体（地表判定要包含它）
s = s.replace("if (ch === '#' || ch === '=' || ch === 'v' || ch === 'n' || ch === '/') { t = r; break; }",
              "if (ch === '#' || ch === '=' || ch === '@' || ch === 'v' || ch === 'n' || ch === '/') { t = r; break; }")
g.write_text(s, encoding="utf-8")
print("game.js: '@' 半格支持已加")

# 3) 1-1 台阶改成半格：把第 7 行换成 '@'
p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")
old2 = '''for _c in range(15, 17):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"
for _c in range(17, 26):
    for _r in range(8, ROWS):
        rows[_r][_c] = "#"'''
new2 = '''for _c in range(15, 17):
    rows[7][_c] = "@"          # 半格台阶：会撞但不至于过不去
    for _r in range(8, ROWS):
        rows[_r][_c] = "#"
for _c in range(17, 26):
    for _r in range(8, ROWS):
        rows[_r][_c] = "#"'''
if old2 in t:
    t = t.replace(old2, new2)
    print("  ok: 1-1 用半格台阶")
p.write_text(t, encoding="utf-8")
print("done")

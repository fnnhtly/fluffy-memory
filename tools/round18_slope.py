"""让车掉下平台后还能继续走：把平台改成"缓坡上台 + 垂直下坠"，并延长下坡。

现在的问题是：平台是 1 米高，车冲上去后掉下 1 米，撞击消耗动能，然后停在原地。

改法：**平台后接一段长下坡**（1 格降 3 格 = 18°），车撞击后顺着下坡继续加速。
"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

old = '''# 抬高一整段平台（硬台阶的"上沿"），然后**往下掉 1 格** —— 车会飞出去再砸地
for _c in range(12, 17):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"
for _c in range(17, 26):
    for _r in range(8, ROWS):
        rows[_r][_c] = "#"'''
new = '''# 平台 → 硬落差 → **长下坡**（撞击后顺坡继续加速）
for _c in range(12, 17):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"
for _c in range(17, cols):
    _top = min(8, 8 + (_c - 16))
    for _r in range(_top, ROWS):
        rows[_r][_c] = "#"'''
if old in t:
    t = t.replace(old, new)
    print("  ok: 平台 + 长下坡")

# 终点往后再放
t = t.replace('put(rows, 19, 7, "E")', 'put(rows, 30, 7, "E")')
t = t.replace('"goal": {"col": 19, "row": 7},', '"goal": {"col": 30, "row": 7},')
t = t.replace('put(rows, 18, 7, "B")', 'put(rows, 24, 7, "B")')
t = t.replace('"boxes": [{"col": 18, "row": 7}]', '"boxes": [{"col": 24, "row": 7}]')
p.write_text(t, encoding="utf-8")
print("done")

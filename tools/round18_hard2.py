"""1-1 启用硬台阶：把 col 14..16 标记为硬列，形成真正 1 米的垂直台阶。

然后缩小台阶高度或加下坡，让车能过、但会撞。
"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

# 1-1 加 hardCols
old = '''# 中段一道 1 格台阶 + 后接缓下坡：车会弹一下（触发撞击演出）再顺坡下去
for _c in range(14, 17):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"
for _c in range(17, 24):
    _top = min(8, 8 + (_c - 16))
    for _r in range(_top, ROWS):
        rows[_r][_c] = "#"'''
new = '''# 中段一道"硬台阶"（不平滑 → 真垂直落差）：车会撞一下，触发出撞击演出
for _c in range(15, 17):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"
for _c in range(17, 24):
    _top = min(8, 8 + (_c - 16))
    for _r in range(_top, ROWS):
        rows[_r][_c] = "#"'''
if old in t:
    t = t.replace(old, new)
    print("  ok: 台阶位置调整")

# 给 1-1 的 level 对象加 hardCols
t = t.replace('"levelId": "1-1", "name": "放个轮子", "chapter": 1, "biome": "field",',
              '"levelId": "1-1", "name": "放个轮子", "chapter": 1, "biome": "field",\n    "hardCols": [15, 16],')
p.write_text(t, encoding="utf-8")
print("done")

"""正确做法：**下台阶**（车往下掉），而不是上台阶（车要爬）。

下台阶：车高速滚过去，轮子离地 → 落地时 vn 大 → 触发撞击演出，
但因为是往下走，不需要"爬上去"，不会卡住。

1-1 改成：缓降平台 → 1 格落差（硬）→ 继续平地。
"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

old = '''for _c in range(15, 17):
    rows[7][_c] = "@"          # 半格台阶：会撞但不至于过不去
    for _r in range(8, ROWS):
        rows[_r][_c] = "#"
for _c in range(17, 26):
    for _r in range(8, ROWS):
        rows[_r][_c] = "#"'''
new = '''# 抬高一整段平台（硬台阶的"上沿"），然后**往下掉 1 格** —— 车会飞出去再砸地
for _c in range(12, 17):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"
for _c in range(17, 26):
    for _r in range(8, ROWS):
        rows[_r][_c] = "#"'''
if old in t:
    t = t.replace(old, new)
    print("  ok: 改成平台+下坠")

# hardCols 改成 17（下坠那一列）
t = t.replace('"hardCols": [15, 16],', '"hardCols": [17],')
p.write_text(t, encoding="utf-8")
print("done")

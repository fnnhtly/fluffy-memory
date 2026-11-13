"""把 1-1 完整还原成"已通过 34/34 的版本"，只保留一个视觉用的小起伏。

已验证可用的 1-1 生成代码（来自 round 14 前）：
    ramp_start(rows, cols, high_row=5, flat_row=FLOOR, ramp_cols=12)
    put(rows, 1, 4, "S")
    put(rows, 25, 7, "E")     ← 终点（round14 从 26 调到 25）
    put(rows, 22, 7, "B")
"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

i = t.find("# ---------------- 1-1")
j = t.find("levels.append({", i)
assert i > 0 and j > i

new_seg = '''# ---------------- 1-1 放个轮子 ----------------
cols = 40
rows = blank(cols)
ramp_start(rows, cols, high_row=5, flat_row=FLOOR, ramp_cols=12)
put(rows, 1, 4, "S")                  # 出生在坡顶（地表 row 5）
put(rows, 25, 7, "E")
put(rows, 22, 7, "B")
'''
t = t[:i] + new_seg + t[j:]

# 确保 hardCols 不残留
t = t.replace('"hardCols": [15, 16],\n', '').replace('"hardCols": [16, 17],\n', '')
p.write_text(t, encoding="utf-8")
print("1-1 已完整还原")

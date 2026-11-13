"""硬台阶太高（1 米过不去），改成"两级 0.5 米"：
用 mapRows 无法表达半格，改用 surfaceOffset 机制 —— 或者更简单：
把 1-1 的短坎高度改成"原始地表行 7（1 米）但只占 1 列"，让车带着速度冲上去。

其实更直接：**给 1-1 加马达**。这样车有持续动力能爬过台阶，同时撞击演出仍然触发。
1-1 的教学点是"放个轮子"，加马达会破坏教学意图。

最终方案：把硬台阶从 1 米降到 0.5 米（用 heightField 的 0.5 偏移）。
但 mapRows 是整格，做不到 0.5。

所以：**保留 1 米硬台阶，但把台阶放在下坡之后**（车已经积累速度）。
"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

# 撤销刚才的台阶，改成"下坡后接硬台阶下坠"
old = '''# 中段一道"硬台阶"（不平滑 → 真垂直落差）：车会撞一下，触发出撞击演出
for _c in range(15, 17):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"
for _c in range(17, 24):
    _top = min(8, 8 + (_c - 16))
    for _r in range(_top, ROWS):
        rows[_r][_c] = "#"'''
new = '''# 中段：先抬 1 格（硬台阶，车会撞）再缓缓下降回平地
for _c in range(15, 17):
    for _r in range(7, ROWS):
        rows[_r][_c] = "#"
for _c in range(17, 26):
    for _r in range(8, ROWS):
        rows[_r][_c] = "#"'''
if old in t:
    t = t.replace(old, new)
    print("  ok: 台阶后改平地")

p.write_text(t, encoding="utf-8")
print("done")

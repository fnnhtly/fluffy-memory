"""落差被线性插值摊平 → 需要把"硬"的范围覆盖到插值的两端。

surfaceY 在列之间做线性插值，所以 col16(6.59) → col17(6.00) 的落差是渐变的。
要让斜率真正陡，需要 **连续 2 列都是原始高度**：
  col16 = 7（平台高）, col17 = 8（地面高），且两列都硬 → 插值区间内就直接掉 1 米。
"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

t = t.replace('"hardCols": [17],', '"hardCols": [16, 17],')
p.write_text(t, encoding="utf-8")
print("hardCols 改成 [16, 17]")

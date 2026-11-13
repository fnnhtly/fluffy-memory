"""按行号精确插入缩略图调用（避开字符串匹配的坑）。"""
import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

p = pathlib.Path("prototype/index.html")
lines = p.read_text(encoding="utf-8").split("\n")

# 找到 '// 零件箱' 那一行（在 drawLevelSelect 内）
target = None
for i, line in enumerate(lines):
    if "const boxTxt = Object.keys(lv.partsBox" in line:
        target = i
        break
assert target is not None, "boxTxt line not found"
print("boxTxt at line", target + 1)

# 在它前面插入两行：缩略图调用 + 注释
insert = [
    "      // 地形缩略图",
    "      drawLevelThumb(lv, x + 12, y + 176, CW - 24, 44);",
]
lines[target:target] = insert

# 零件箱文字下移（y+202 → y+236）
for i, line in enumerate(lines):
    if "text(boxTxt, x + CW / 2" in line:
        lines[i] = line.replace("y + 202", "y + 236").replace("y + 190", "y + 236")
        print("boxTxt y adjusted at line", i + 1)

# ★★★ 条件文字微调
for i, line in enumerate(lines):
    if "x + CW / 2, y + 168, 11, '#8fb6c9'" in line:
        lines[i] = line.replace("y + 168", "y + 166")
        print("challenge text adjusted at line", i + 1)

p.write_text("\n".join(lines), encoding="utf-8")
print("done")

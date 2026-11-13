"""删掉 1-1 里多余的 ramp_start（它把地形重置成初始坡，覆盖了后面的高台设置）。"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

# 找到 1-1 段里的 ramp_start 那一行并删除
i = t.find("# ---------------- 1-1")
j = t.find("levels.append({", i)
seg = t[i:j]
print("--- 1-1 段（地形生成部分）：")
for line in seg.split("\n"):
    if line.strip():
        print("   ", line)

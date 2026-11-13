"""清理重复：删掉所有 stoneW 声明所在段，只保留刚插入的那一份。"""
import pathlib
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 找所有 "const stoneW = " 出现位置
positions = [m.start() for m in re.finditer(r"const stoneW = ", t)]
print("stoneW 声明次数:", len(positions))
for pos in positions:
    line_no = t[:pos].count("\n") + 1
    print("  行", line_no)

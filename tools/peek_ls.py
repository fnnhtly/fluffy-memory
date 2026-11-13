import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
t = pathlib.Path("prototype/index.html").read_text(encoding="utf-8")
i = t.find("function drawLevelSelect()")
j = t.find("function levelCardRect")
seg = t[i:j]
# 打印带行号的片段
for n, line in enumerate(seg.split("\n"), 1):
    print(f"{n:4d} {line}")

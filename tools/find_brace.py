"""定位 drawWorld 里多出来的那个大括号。"""
import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

p = pathlib.Path("prototype/index.html")
lines = p.read_text(encoding="utf-8").split("\n")

start = next(i for i, ln in enumerate(lines) if "function drawWorld(ter, cam)" in ln)
end = next(i for i, ln in enumerate(lines) if "function drawGrid()" in ln)

depth = 0
for i in range(start, end):
    ln = lines[i]
    for ch in ln:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
    if depth < 0:
        print(f"行 {i+1}: depth 变负 → {ln!r}")
        break
print("结束时 depth =", depth)
# 打印最后 12 行
for i in range(max(start, end - 12), end):
    print(f"{i+1:5d} {lines[i]}")

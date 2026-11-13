"""删掉第一份（残留的）石块代码块，保留刚插入的完整版本。"""
import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

p = pathlib.Path("prototype/index.html")
lines = p.read_text(encoding="utf-8").split("\n")

# 找第一处 const stoneW
first = next(i for i, ln in enumerate(lines) if "const stoneW = " in ln)
print("第一份 stoneW 在行", first + 1)

# 往前找该块的起点：最近的 "ctx.save();" 之后紧跟 traceTerrain 的位置
start = first
for i in range(first, max(0, first - 20), -1):
    if "ctx.save();" in lines[i]:
        start = i
        break
print("块起点行", start + 1, repr(lines[start]))

# 往后找块终点：最近的 "ctx.restore();"
end = first
for i in range(first, min(len(lines), first + 130)):
    if "ctx.restore();" in lines[i]:
        end = i
        break
print("块终点行", end + 1, repr(lines[end]))
print("将删除", end - start + 1, "行")

del lines[start:end + 1]
p.write_text("\n".join(lines), encoding="utf-8")
print("已删除重复块")

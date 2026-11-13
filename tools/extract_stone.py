"""从 git 快照里提取"石块绘制"内部代码（去掉离屏缓存包装），拼成直接绘制版本。"""
import pathlib

src = pathlib.Path("records/index-damaged-checkpoint.html").read_text(encoding="utf-8")
start = src.find("    // ---------- 石块层（离屏缓存")
assert start > 0
end = src.find("    // 石头表面的小碎石", start)
assert end > start
block = src[start:end]

# 提取内部绘制（setTransform 之后 → restore 之前）
a = block.find("        ctx.setTransform(sx, 0, 0, sy, VIEW_OFF_X * sx, VIEW_OFF_Y * sy);")
assert a > 0
a = block.find("\n", a) + 1
b = block.find("        ctx.globalAlpha = 1;\n        ctx = savedCtx;", a)
assert b > a
inner = block[a:b]

# 反缩进 4 空格
lines = []
for ln in inner.split("\n"):
    lines.append(ln[4:] if ln.startswith("        ") else ln)
inner = "\n".join(lines)

pathlib.Path("records/stone-inner.txt").write_text(inner, encoding="utf-8")
print("提取", len(lines), "行")
print(inner[:600])

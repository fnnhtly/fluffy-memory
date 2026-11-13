"""还原石块层为直接绘制（去掉离屏缓存包装）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

start = t.find("    // ---------- 石块层（离屏缓存：只在相机明显移动时重绘）----------")
assert start > 0, "stone cache block not found"

# 找到块结束："ctx.drawImage(stoneLayer, ...)" 那一行之后
anchor = "      ctx.drawImage(stoneLayer, -VIEW_OFF_X, -VIEW_OFF_Y, VIEW_W, VIEW_H);"
idx = t.find(anchor, start)
assert idx > 0, "drawImage not found"
end = idx + len(anchor) + 1
# 再吃掉后面的 "    }\n\n"
while t[end] in "\r\n":
    end += 1
if t[end:end+2] == "  }":
    end += 2
while t[end] in "\r\n":
    end += 1

block = t[start:end]
print("石块缓存块行数:", block.count("\n"))

# 从块内救出真正的绘制代码
inner_start = block.find("        ctx.setTransform(sx, 0, 0, sy, VIEW_OFF_X * sx, VIEW_OFF_Y * sy);")
assert inner_start > 0, "setTransform not found"
inner_start = block.find("\n", inner_start) + 1
inner_end = block.find("        ctx.globalAlpha = 1;\n        ctx = savedCtx;", inner_start)
assert inner_end > inner_start, "restore not found"
inner = block[inner_start:inner_end]

# 反缩进 4 空格（从 8 空格缩进回到 4）
lines = inner.split("\n")
fixed = []
for ln in lines:
    if ln.startswith("        "):
        fixed.append(ln[4:])
    else:
        fixed.append(ln)
inner = "\n".join(fixed)

# 用直接绘制替换整个缓存块
t = t[:start] + inner + t[end:]
p.write_text(t, encoding="utf-8")
print("石块层已还原为直接绘制，救出", len(lines), "行")

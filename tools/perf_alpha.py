"""修 HUD 变透明：缓存块内切换 ctx 时会残留 globalAlpha / globalCompositeOperation。

在切换前后强制重置 alpha=1，并保证 restore。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 在每处 "ctx = savedCtx" 之前加 alpha 重置
t = t.replace("        ctx = savedCtx;", "        ctx.globalAlpha = 1;\n        ctx = savedCtx;\n        ctx.globalAlpha = 1;")
t = t.replace("        ctx = savedCtx2;", "        ctx.globalAlpha = 1;\n        ctx = savedCtx2;\n        ctx.globalAlpha = 1;")

# 在切换进入离屏之前也重置
t = t.replace("        ctx = skyCtx;", "        ctx = skyCtx;\n        ctx.globalAlpha = 1;")
t = t.replace("        ctx = stoneCtx;", "        ctx = stoneCtx;\n        ctx.globalAlpha = 1;")

p.write_text(t, encoding="utf-8")
print("globalAlpha 已重置")

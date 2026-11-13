"""全屏铺色统一改成覆盖可视区（含扩展部分），否则宽屏两侧会黑边。

把所有 `ctx.fillRect(0, 0, DW, DH)` 全屏铺色换成 `fillScreen(color)`，
它按 VIEW 尺寸铺满（从 -VIEW_OFF 开始）。
"""
import pathlib
import re

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 1) 插入 fillScreen 辅助函数（放在 applyCanvasSize 之后）
anchor = "  // ---------- 坐标 ----------"
assert anchor in t
helper = """  // 铺满整个可视区（宽屏时覆盖扩展部分，避免黑边）
  function fillScreen(style) {
    ctx.fillStyle = style;
    ctx.fillRect(-VIEW_OFF_X - 4, -VIEW_OFF_Y - 4, VIEW_W + 8, VIEW_H + 8);
  }

""" + anchor
t = t.replace(anchor, helper, 1)

# 2) 逐个替换全屏铺色
pairs = [
    ("    ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);",
     "    fillScreen(g);"),
    ("      ctx.fillStyle = caveV; ctx.fillRect(0, 0, DW, DH);",
     "      fillScreen(caveV);"),
    ("    ctx.fillStyle = glow; ctx.fillRect(0, 0, DW, DH);",
     "    fillScreen(glow);"),
    ("      ctx.fillStyle = 'rgba(6,12,14,.35)'; ctx.fillRect(0, 0, DW, DH);",
     "      fillScreen('rgba(6,12,14,.35)');"),
    ("      ctx.fillStyle = 'rgba(8,14,18,.62)'; ctx.fillRect(0, 0, DW, DH);",
     "      fillScreen('rgba(8,14,18,.62)');"),
]
for a, b in pairs:
    if a in t:
        t = t.replace(a, b)
        print("  ok:", a.strip()[:46])

# 3) 剩余零散的全屏铺色（带别的 fillStyle 变量）
t = t.replace("    ctx.fillStyle = 'rgba(255,255,255,' + (state.flash * 0.5).toFixed(3) + ')';\n    ctx.fillRect(0, 0, DW, DH);",
              "    fillScreen('rgba(255,255,255,' + (state.flash * 0.5).toFixed(3) + ')');")
t = t.replace("      ctx.fillStyle = vg; ctx.fillRect(0, 0, DW, DH);", "      fillScreen(vg);")
t = t.replace("      ctx.fillStyle = 'rgba(6,12,16,.82)'; ctx.fillRect(0, 0, DW, DH);", "      fillScreen('rgba(6,12,16,.82)');")
t = t.replace("    ctx.fillStyle = 'rgba(6,12,16,.86)'; ctx.fillRect(0, 0, DW, DH);", "    fillScreen('rgba(6,12,16,.86)');")
t = t.replace("      ctx.fillStyle = 'rgba(8,14,10,.58)'; ctx.fillRect(0, 0, DW, DH);", "      fillScreen('rgba(8,14,10,.58)');")

p.write_text(t, encoding="utf-8")
print("全屏铺色统一完成")
print("剩余 DW, DH 全屏:", t.count("fillRect(0, 0, DW, DH)"))

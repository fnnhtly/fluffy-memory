"""把装饰层（丛林/棕榈/远山/钟乳石）都改成按 VIEW 宽度铺，
否则宽屏（21:9）两侧会没有丛林和山，露出空天空。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def sub(a, b, tag):
    global t
    if a not in t:
        print("  MISS:", tag)
        return
    t = t.replace(a, b, 1)
    print("  ok:", tag)


# 1) 丛林：宽度用 VIEW，起始左移
sub("      const n = Math.ceil(DW / (r0 * 1.5)) + 3;\n"
    "      for (let i = 0; i < n; i++) {\n"
    "        const bx = (i - 1) * r0 * 1.5 + (i % 2) * r0 * 0.4;",
    "      const n = Math.ceil((VIEW_W + VIEW_OFF_X * 2) / (r0 * 1.5)) + 4;\n"
    "      for (let i = 0; i < n; i++) {\n"
    "        const bx = (i - 1) * r0 * 1.5 + (i % 2) * r0 * 0.4 - VIEW_OFF_X;",
    "丛林宽度")

# 2) 远山：数量与起始按 VIEW
sub("    for (let i = 0; i < 9; i++) {\n"
    "      const bx = i * 190 - 140, hh = 78 - (i % 3) * 18;",
    "    const hillN = Math.ceil((VIEW_W + VIEW_OFF_X * 2) / 190) + 3;\n"
    "    for (let i = 0; i < hillN; i++) {\n"
    "      const bx = i * 190 - 140 - VIEW_OFF_X, hh = 78 - (i % 3) * 18;",
    "远山宽度")

# 3) 钟乳石：宽度用 VIEW
sub("      for (let ci = 0; ci < 14; ci++) {\n"
    "        const bx = (ci / 13) * DW + ((ci * 37) % 40) - 20;",
    "      const dripN = Math.max(14, Math.ceil((VIEW_W + VIEW_OFF_X * 2) / 78));\n"
    "      for (let ci = 0; ci < dripN; ci++) {\n"
    "        const bx = (ci / (dripN - 1)) * (VIEW_W + VIEW_OFF_X * 2) + ((ci * 37) % 40) - 20 - VIEW_OFF_X;",
    "钟乳石宽度")

# 4) 远景地面矩形：铺满可视宽
sub("    ctx.fillStyle = farGround;\n    ctx.fillRect(0, horizonY - 70, DW, 190);",
    "    ctx.fillStyle = farGround;\n"
    "    ctx.fillRect(-VIEW_OFF_X - 4, horizonY - 70, VIEW_W + VIEW_OFF_X * 2 + 8, 190);",
    "远景地面宽度")

# 5) 远景泥地过渡带：铺满可视宽
sub("    ctx.fillStyle = '#6b7a52';\n"
    "    ctx.fillRect(0, horizonY + 118, DW, Math.max(0, toY(ter.surfaceY(cam.x)) - (horizonY + 118)) + 6);",
    "    ctx.fillStyle = '#6b7a52';\n"
    "    ctx.fillRect(-VIEW_OFF_X - 4, horizonY + 118, VIEW_W + VIEW_OFF_X * 2 + 8,\n"
    "      Math.max(0, toY(ter.surfaceY(cam.x)) - (horizonY + 118)) + 6);",
    "过渡带宽度")

# 6) 雾带
sub("    ctx.fillStyle = fogM; ctx.fillRect(0, horizonY + 40, DW, 100);",
    "    ctx.fillStyle = fogM;\n"
    "    ctx.fillRect(-VIEW_OFF_X - 4, horizonY + 40, VIEW_W + VIEW_OFF_X * 2 + 8, 100);",
    "雾带宽度")

# 7) 云：宽屏补两团
sub("      cloud(DW * 0.36, 190, 0.85, 0.6);",
    "      cloud(DW * 0.36, 190, 0.85, 0.6);\n"
    "      if (VIEW_W > DW + 80) {\n"
    "        cloud(-VIEW_OFF_X * 0.5 + 60, 150, 1.1, 0.7);\n"
    "        cloud(DW + VIEW_OFF_X * 0.5, 108, 1.2, 0.75);\n"
    "      }",
    "宽屏补云")

p.write_text(t, encoding="utf-8")
print("装饰层适配完成")

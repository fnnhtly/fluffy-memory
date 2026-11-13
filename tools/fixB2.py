"""按实际内容重做 index.html 的改动（底部带、帮助按钮、暂停/重来按钮、帮助面板、暂停逻辑）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 底部装饰带压薄
rep("    const seaY = DH * 0.87;", "    const seaY = DH * 0.935;", "海面下移")
rep("    ctx.fillRect(0, seaY - 16, DW, 16);", "    ctx.fillRect(0, seaY - 9, DW, 9);", "沙滩变薄")

# 2) 状态位
rep("    dragPart: null, dragFromTray: false, mouse: { x: 0, y: 0, down: false },",
    "    dragPart: null, dragFromTray: false, mouse: { x: 0, y: 0, down: false },\n    helpOpen: false, paused: false,", "状态位")

# 3) 按钮矩形
rep("      if (name === 'rotate') return { x: 84, y: 460, w: 56, h: 56 };",
    "      if (name === 'rotate') return { x: 84, y: 460, w: 56, h: 56 };\n"
    "      if (name === 'help') return { x: DW / 2 + 150, y: 372, w: 76, h: 44 };", "帮助按钮(build)")
rep("""    if (state.phase === 'run') {
      if (name === 'interact') return { x: 0, y: DH - 150, w: 92, h: 92 };""",
"""    if (state.phase === 'run') {
      if (name === 'pause') return { x: 24, y: 84, w: 46, h: 46 };
      if (name === 'restartRun') return { x: 24, y: 138, w: 46, h: 46 };
      if (name === 'help') return { x: DW - 70, y: 84, w: 46, h: 46 };
      if (name === 'interact') return { x: 0, y: DH - 150, w: 92, h: 92 };""", "暂停/重来/帮助(run)")

p.write_text(t, encoding="utf-8")
print("part1 written")

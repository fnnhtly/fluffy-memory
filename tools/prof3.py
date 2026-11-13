"""给 frameBody 整体和各 UI 阶段加计时，找出 70ms 花在哪。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 在 frameBody 开头/结尾加总计时
anchor = "  function frameBody(now) {"
i = t.find(anchor)
assert i > 0
le = t.find("\n", i) + 1
init = """    const __g0 = performance.now();
    const __gp = (window.__gprof = window.__gprof || {});
"""
t = t[:le] + init + t[le:]

# 在几个关键点加 mark
marks = [
    ("      drawWorld(ter, cam);", "world"),
    ("      drawGrid();", "grid"),
    ("      drawTray();", "tray"),
    ("      drawHud();", "hud"),
    ("      drawTabs();", "tabs"),
    ("      drawButtons();", "buttons"),
]
for txt, name in marks:
    idx = t.find(txt)
    if idx < 0:
        print("  MISS:", name)
        continue
    ls = t.rfind("\n", 0, idx) + 1
    t = t[:ls] + "    __gprof._m = performance.now();\n" + t[ls:]
    print("  ok(note):", name)

p.write_text(t, encoding="utf-8")
print("占位加完（下一步手工精确打点）")

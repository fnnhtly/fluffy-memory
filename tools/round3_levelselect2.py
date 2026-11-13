"""把选关页接上交互：ESC / L 键开关，点卡片进关，点空白关闭；并把顶部页签改成"关卡"按钮。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) mousedown：选关页优先
rep("    // 零件说明面板开着时：点任何地方都先关掉它（不会误触到下面的按钮）\n    if (state.helpOpen) { state.helpOpen = false; return; }",
"""    // 零件说明面板开着时：点任何地方都先关掉它（不会误触到下面的按钮）
    if (state.helpOpen) { state.helpOpen = false; return; }

    // 选关页：点卡片进入，点空白关闭
    if (state.levelSelect) {
      for (let i = 0; i < levels.length; i++) {
        const r0 = levelCardRect(i);
        if (hit(r0, p.x, p.y)) { state.levelSelect = false; startLevel(i); return; }
      }
      state.levelSelect = false;
      return;
    }""", "选关页点击")

# 2) 顶部页签里第一个改成"关卡"按钮
rep("""    // 顶部关卡页签
    for (let i = 0; i < levels.length; i++) {
      if (hit(tabRect(i), p.x, p.y)) { startLevel(i); return; }
    }""",
"""    // 顶栏：第一个是「关卡」入口，其余仍是快速切换
    if (hit(tabRect(0), p.x, p.y)) { state.levelSelect = true; return; }
    for (let i = 1; i < levels.length; i++) {
      if (hit(tabRect(i), p.x, p.y)) { startLevel(i); return; }
    }""", "页签改造")

# 3) 页签绘制：第一个显示"关卡"
rep("      text(lv.levelId, t.x + t.w / 2, t.y + 21, 14, active ? '#fff' : '#9fb2c2', 'center', active);",
"""      if (i === 0) {
        text('☰ 关卡', t.x + t.w / 2, t.y + 21, 13, '#ffe9b0', 'center', true);
      } else {
        text(lv.levelId, t.x + t.w / 2, t.y + 21, 14, active ? '#fff' : '#9fb2c2', 'center', active);
      }""", "页签文字")

# 4) 键：ESC / L
rep("    if (k === 'h') { state.helpOpen = !state.helpOpen; return; }",
    "    if (k === 'escape' || k === 'l') { state.levelSelect = !state.levelSelect; return; }\n"
    "    if (k === 'h') { state.helpOpen = !state.helpOpen; return; }", "ESC/L 键")

# 5) 底部提示补一句
rep("        DW / 2, DH - 130, 10.5, 'rgba(200,218,232,.55)', 'center');",
    "        DW / 2, DH - 130, 10.5, 'rgba(200,218,232,.55)', 'center');", "（无变化）")
t = t.replace("'左键放件 · 拖动可移动 · 右键/R 换方向 · Z 撤销 · C 清空 · 空格出发 · T 调参 · H 零件说明'",
              "'左键放件 · 拖动可移动 · 右键/R 换方向 · Z 撤销 · C 清空 · 空格出发 · T 调参 · H 零件说明 · L 选关'")

p.write_text(t, encoding="utf-8")
print("交互接好")

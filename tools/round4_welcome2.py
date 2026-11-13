"""欢迎页交互：下一步 / 跳过 / 关掉时写 localStorage；选关页可重新打开。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) mousedown：欢迎页优先
rep("    // 零件说明面板开着时：点任何地方都先关掉它（不会误触到下面的按钮）",
"""    // 欢迎引导：必须用按钮翻页（避免误触关闭）
    if (state.welcome) {
      const bk = welcomeSkipRect(), bn = welcomeBtnRect();
      if (hit(bk, p.x, p.y)) { closeWelcome(); return; }
      if (hit(bn, p.x, p.y)) {
        if (state.welcome >= WELCOME_PAGES.length) closeWelcome();
        else state.welcome++;
        return;
      }
      return;   // 其他点击吞掉
    }

    // 零件说明面板开着时：点任何地方都先关掉它（不会误触到下面的按钮）""", "欢迎页点击")

# 2) closeWelcome
rep("  function toast(msg) { state.toast = msg; state.toastT = 2.2; }",
"""  function closeWelcome() {
    state.welcome = 0;
    try { localStorage.setItem('rap-welcomed-v1', '1'); } catch (e) {}
  }

  function toast(msg) { state.toast = msg; state.toastT = 2.2; }""", "closeWelcome")

# 3) 选关页加「玩法说明」按钮（重新打开欢迎页）
rep("    text('点卡片进入关卡　·　按 ESC 或点空白关闭', DW / 2, DH - 54, 12, '#7f97a6', 'center');",
"""    // 「玩法说明」按钮：重新打开欢迎引导
    const hb2 = { x: DW / 2 - 80, y: DH - 96, w: 160, h: 38 };
    ctx.fillStyle = 'rgba(74,123,168,.9)';
    roundRect(hb2.x, hb2.y, hb2.w, hb2.h, 10); ctx.fill();
    text('? 玩法说明', hb2.x + hb2.w / 2, hb2.y + 25, 14, '#ffffff', 'center', true);
    text('点卡片进入关卡　·　按 ESC 或点空白关闭', DW / 2, DH - 18, 12, '#7f97a6', 'center');""",
    "选关页加玩法说明按钮")

# 4) 该按钮点击
rep("      state.levelSelect = false;\n      return;\n    }",
"""      const hbr = { x: DW / 2 - 80, y: DH - 96, w: 160, h: 38 };
      if (hit(hbr, p.x, p.y)) { state.levelSelect = false; state.welcome = 1; return; }
      state.levelSelect = false;
      return;
    }""", "玩法说明按钮点击")

p.write_text(t, encoding="utf-8")
print("欢迎页交互完成")

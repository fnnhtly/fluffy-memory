"""第 12 轮：关卡入场镜头 + 结算推镜过渡

1) 进入关卡时，镜头从"关卡全景"推到建造区（1.2 秒缓动），期间建造台淡入
2) 通关/失败时，镜头先推近 0.2 秒再盖结算卡片（现在硬切）
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) 状态：入场镜头 + 结算过渡 ----------
rep("    camState: { x: 0, y: 0, zoom: 1.7 }, shake: 0, flash: 0, vignette: 0, levelSelect: false,",
    "    camState: { x: 0, y: 0, zoom: 1.7 }, shake: 0, flash: 0, vignette: 0, levelSelect: false,\n"
    "    introT: 0,        // 入场镜头进度 0→1\n"
    "    outroT: 0,        // 结算过渡进度 0→1", "状态位")

# ---------- 2) startLevel 触发入场 ----------
rep("""    state.selected = 'wood_frame';
    state.cam = buildCam();
  }""",
"""    state.selected = 'wood_frame';
    state.cam = buildCam();
    state.introT = 0;          // 触发入场镜头
    state.outroT = 0;
  }""", "startLevel 触发入场")

# ---------- 3) 建造界面的镜头：入场时从全景推近 ----------
rep("""      drawWorld(ter, cam);
      ctx.save();
      ctx.translate(0, VIEW_OFF_Y);      // UI 在设计区居中（4:3 时上下有扩展）
      drawGrid();""",
"""      // 入场镜头：从关卡全景推到建造区
      if (state.introT < 1) {
        state.introT = Math.min(1, state.introT + dt / 1.2);
        const k = 1 - Math.pow(1 - state.introT, 3);      // ease-out cubic
        const wide = { x: cam.x + 9, y: cam.y + 3.2, zoom: 0.72 };
        cam.x = wide.x + (cam.x - wide.x) * k;
        cam.y = wide.y + (cam.y - wide.y) * k;
        cam.zoom = wide.zoom + (cam.zoom - wide.zoom) * k;
      }
      drawWorld(ter, cam);
      ctx.save();
      ctx.translate(0, VIEW_OFF_Y);      // UI 在设计区居中（4:3 时上下有扩展）
      // 入场时 UI 淡入（前 40% 不显示）
      const uiAlpha = state.introT < 0.35 ? 0 : Math.min(1, (state.introT - 0.35) / 0.35);
      if (uiAlpha < 1) ctx.globalAlpha = uiAlpha;
      drawGrid();""", "入场镜头")

# ---------- 4) UI 淡入结束后恢复 alpha ----------
rep("""      drawTray();
      drawButtons();
      drawTabs();
      drawHud();
      ctx.restore();""",
"""      drawTray();
      drawButtons();
      drawTabs();
      drawHud();
      if (uiAlpha < 1) ctx.globalAlpha = 1;
      ctx.restore();""", "恢复 alpha")

p.write_text(t, encoding="utf-8")
print("入场镜头完成")

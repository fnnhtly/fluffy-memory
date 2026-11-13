"""4:3 下 HUD 整体偏上、底部露天空：因为 HUD 用的是固定 1280×720 坐标，
而 4:3 时可视高度是 960（上下各扩 120）。

修法：在所有 UI 绘制（drawGrid/drawTray/drawButtons/drawTabs/drawHud/弹窗等）外面
套一层 translate(0, VIEW_OFF_Y)，让 UI 始终居中在设计区。
GUI 用 ctx.save/restore 包裹，不影响世界绘制。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 在 frameBody 里，world 绘制之后、UI 绘制之前套 translate
old = """      drawWorld(ter, cam);
      drawGrid();"""
new = """      drawWorld(ter, cam);
      ctx.save();
      ctx.translate(0, VIEW_OFF_Y);      // UI 在设计区居中（4:3 时上下有扩展）
      drawGrid();"""
assert old in t
t = t.replace(old, new, 1)

old2 = """      drawTray();
      drawButtons();
      drawTabs();
      drawHud();
    } else if (state.phase === 'run' || state.phase === 'resolved') {"""
new2 = """      drawTray();
      drawButtons();
      drawTabs();
      drawHud();
      ctx.restore();
    } else if (state.phase === 'run' || state.phase === 'resolved') {"""
assert old2 in t
t = t.replace(old2, new2, 1)

p.write_text(t, encoding="utf-8")
print("build UI 已居中")

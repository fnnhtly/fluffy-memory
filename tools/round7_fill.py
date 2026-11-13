"""去掉 canvas 的固定 16:9 CSS 限制 —— 它把画布锁死成 16:9，
导致 21:9 / 4:3 窗口下只会产生黑边，看不到扩展后的视野。

改成：canvas 宽度 = 窗口宽度（或按高度算的宽度，取小），高度 = 窗口高度，
由 JS 的 applyCanvasSize 根据实际 CSS 尺寸设置像素。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

old_css = """  canvas { display: block; box-shadow: 0 10px 40px rgba(0,0,0,.6); cursor: pointer;
    width: min(100vw, 100vh * 16 / 9); height: auto; aspect-ratio: 16 / 9; }
  body.letterbox canvas { box-shadow: none; }"""
new_css = """  canvas { display: block; box-shadow: 0 10px 40px rgba(0,0,0,.6); cursor: pointer;
    width: 100vw; height: 100vh; }"""
assert old_css in t, "css block not found"
t = t.replace(old_css, new_css)

# wrap 也铺满
t = t.replace("  #wrap { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }",
              "  #wrap { position: fixed; inset: 0; display: block; }")

p.write_text(t, encoding="utf-8")
print("canvas 铺满窗口")

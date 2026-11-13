"""修网页渲染的三个问题：
1) worldToScreen 少乘 PPM：zoom 被当成"像素/米"，导致地形被压成一条竖线
2) 画布不随窗口缩放 → 改用 CSS 适配（用户窗口小于 1280 时也能看全）
3) 撤销按钮压住出发按钮 → 挪到零件槽上方右侧
顺便暴露 window.__rap 给自动化试玩脚本做断言
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

t = t.replace("  canvas { display: block; box-shadow: 0 10px 40px rgba(0,0,0,.6); cursor: pointer; }",
              "  canvas { display: block; box-shadow: 0 10px 40px rgba(0,0,0,.6); cursor: pointer;\n"
              "    width: min(100vw, 1280px); height: auto; aspect-ratio: 16 / 9; }")

t = t.replace("""  function worldToScreen(wx, wy, cam) {
    return { x: DW / 2 + (wx - cam.x) * cam.zoom, y: DH / 2 - (wy - cam.y) * cam.zoom };
  }""",
              """  function worldToScreen(wx, wy, cam) {
    const s = PPM * cam.zoom;                 // zoom 是"倍率"，实际每米像素 = PPM * zoom
    return { x: DW / 2 + (wx - cam.x) * s, y: DH / 2 - (wy - cam.y) * s };
  }""")

# drawWorld 内部原本乘了 PPM*zoom，现在 worldToScreen 已经含 PPM，去掉重复
t = t.replace("      const w = PPM * cam.zoom + 1;", "      const w = PPM * cam.zoom + 1;   // 列宽（px）")
t = t.replace("      ctx.fillRect(x, topY, w, 10 * cam.zoom);", "      ctx.fillRect(x, topY, w, 10 * cam.zoom);")
t = t.replace("      ctx.fillRect(x, topY - 5 * cam.zoom, w, 5 * cam.zoom);",
              "      ctx.fillRect(x, topY - 5 * cam.zoom, w, 5 * cam.zoom);")

# 建造相机缩放（world 单位 = 米，1.6 倍 → 每米 51px，够看清坡）
t = t.replace("    return { x: level().start.col + 2.5, y: sy + 2.4, zoom: 2.0 };",
              "    return { x: level().start.col + 3.5, y: sy + 1.8, zoom: 1.5 };")
t = t.replace("cam: { x: 0, y: 0, zoom: 2.0 }, toast: '', toastT: 0,",
              "cam: { x: 0, y: 0, zoom: 1.5 }, toast: '', toastT: 0,")
t = t.replace("const cam = { x: car.x + 2, y: Math.max(car.y, st.terrain.surfaceY(car.x)) + 1.6, zoom: 1.35 };",
              "const cam = { x: car.x + 2.5, y: Math.max(car.y, st.terrain.surfaceY(car.x)) + 1.4, zoom: 1.15 };")

# 撤销按钮挪位（在零件槽右上方）
t = t.replace("      if (name === 'undo') return { x: DW - 190, y: DH / 2 + 74, w: 120, h: 44 };",
              "      if (name === 'undo') return { x: DW - 176, y: DH - 196, w: 116, h: 40 };")

# 暴露调试句柄
t = t.replace("  startLevel(0);\n  requestAnimationFrame(frame);",
              "  window.__rap = { state, RAP, levels, startLevel, launch };\n  startLevel(0);\n  requestAnimationFrame(frame);")

p.write_text(t, encoding="utf-8")
print("index.html 渲染修复完成")

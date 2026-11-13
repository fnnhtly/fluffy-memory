"""建造格从 32px 放大到 40px 并居中（参考里车体和格子占屏幕的比例更大）。"""
import pathlib

# 页面
p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")
t = t.replace("  const buildOrigin = () => ({ x: DW / 2 - RAP.BUILD_COLS * PPM / 2, y: DH / 2 - RAP.BUILD_ROWS * PPM / 2 - 20 });",
              "  const BUILD_PX = 40;   // 建造格显示尺寸（比物理 32px/米 大一点，和参考比例接近）\n"
              "  const buildOrigin = () => ({ x: DW / 2 - RAP.BUILD_COLS * BUILD_PX / 2, y: 150 });")
# 网格绘制与格子命中都用 BUILD_PX
t = t.replace("""  function cellAt(mx, my) {
    const o = buildOrigin();
    const c = Math.floor((mx - o.x) / PPM), r = Math.floor((my - o.y) / PPM);""",
"""  function cellAt(mx, my) {
    const o = buildOrigin();
    const c = Math.floor((mx - o.x) / BUILD_PX), r = Math.floor((my - o.y) / BUILD_PX);""")
t = t.replace("""        const x = o.x + c * PPM, y = o.y + r * PPM;
        ctx.fillStyle = ((r + c) % 2 === 0) ? 'rgba(120,150,70,.45)' : 'rgba(100,130,60,.45)';
        roundRect(x + 2, y + 2, PPM - 4, PPM - 4, 5); ctx.fill();""",
"""        const x = o.x + c * BUILD_PX, y = o.y + r * BUILD_PX;
        ctx.fillStyle = ((r + c) % 2 === 0) ? 'rgba(118,148,68,.55)' : 'rgba(98,128,58,.55)';
        roundRect(x + 2, y + 2, BUILD_PX - 4, BUILD_PX - 4, 6); ctx.fill();""")
t = t.replace("      roundRect(o.x + cell.c * PPM + 2, o.y + cell.r * PPM + 2, PPM - 4, PPM - 4, 5); ctx.stroke();",
              "      roundRect(o.x + cell.c * BUILD_PX + 2, o.y + cell.r * BUILD_PX + 2, BUILD_PX - 4, BUILD_PX - 4, 6); ctx.stroke();")
t = t.replace("""      drawPartShape(cell.part, o.x + c * PPM + PPM / 2, o.y + r * PPM + PPM / 2, PPM * 0.8, cell.dir);""",
              """      drawPartShape(cell.part, o.x + c * BUILD_PX + BUILD_PX / 2, o.y + r * BUILD_PX + BUILD_PX / 2, BUILD_PX * 0.84, cell.dir);""")
t = t.replace("""      const cx = o.x + (sx / frames.length) * PPM + PPM / 2;
      const cy = o.y + (sy / frames.length) * PPM + PPM / 2;
      drawPig(cx, cy, PPM * 0.34, 0);""",
"""      const cx = o.x + (sx / frames.length) * BUILD_PX + BUILD_PX / 2;
      const cy = o.y + (sy / frames.length) * BUILD_PX + BUILD_PX / 2;
      drawPig(cx, cy, BUILD_PX * 0.34, 0);""")
t = t.replace("      drawPartShape(ghost, state.mouse.x, state.mouse.y, PPM * 0.8, 0);",
              "      drawPartShape(ghost, state.mouse.x, state.mouse.y, BUILD_PX * 0.84, 0);")
# 按钮仍围绕网格：网格 x 范围 520..760
t = t.replace("if (name === 'launch') return { x: DW / 2 + 116, y: DH / 2 - 20, w: 64, h: 64 };",
              "if (name === 'launch') return { x: DW / 2 + 140, y: 270, w: 64, h: 64 };")
t = t.replace("if (name === 'clear') return { x: DW / 2 - 180, y: DH / 2 - 20, w: 64, h: 64 };",
              "if (name === 'clear') return { x: DW / 2 - 204, y: 270, w: 64, h: 64 };")
t = t.replace("if (name === 'undo') return { x: DW / 2 - 250, y: DH / 2 - 16, w: 56, h: 56 };",
              "if (name === 'undo') return { x: DW / 2 - 280, y: 274, w: 56, h: 56 };")
p.write_text(t, encoding="utf-8")
print("建造格 40px + 居中")

# 自动化坐标
q = pathlib.Path("tools/play_demo2.js")
s = q.read_text(encoding="utf-8")
s = s.replace("const cell = (r, c) => ({ x: (1280 / 2 - 96) + c * 32 + 16, y: (720 / 2 - 128 - 20) + r * 32 + 16 });",
              "const cell = (r, c) => ({ x: (1280 / 2 - 120) + c * 40 + 20, y: 150 + r * 40 + 20 });")
s = s.replace("await click(788, 372);", "await click(812, 302);")
q.write_text(s, encoding="utf-8")
print("自动化坐标更新")

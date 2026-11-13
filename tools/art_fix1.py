"""修这轮画质提升带出的三个新问题：
1) 远山是奶白色三角，从丛林缝隙里透出来很怪 → 改成更深的青灰、压低高度、并在丛林后加一条实心过渡带
2) 树冠叶尖是"朝下的尖刺"（像冰柱）→ 改成朝上生长的叶尖
3) 右上计时条贴边被裁 → 往左挪 12px
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 远山：更深、更矮
rep("    hillFar: '#7FA8B8',", "    hillFar: '#6E93A6',", "远山颜色加深")
rep("""    ctx.fillStyle = COL.hillFar;
    for (let i = 0; i < 7; i++) {
      const bx = i * 220 - 120, hh = 120 - (i % 3) * 26;
      ctx.beginPath();
      ctx.moveTo(bx, horizonY + 30);
      ctx.lineTo(bx + 130, horizonY + 30 - hh);
      ctx.lineTo(bx + 260, horizonY + 30);
      ctx.closePath(); ctx.fill();
    }""",
"""    ctx.fillStyle = COL.hillFar;
    for (let i = 0; i < 9; i++) {
      const bx = i * 190 - 140, hh = 78 - (i % 3) * 18;
      ctx.beginPath();
      ctx.moveTo(bx, horizonY + 34);
      ctx.lineTo(bx + 110, horizonY + 34 - hh);
      ctx.lineTo(bx + 220, horizonY + 34);
      ctx.closePath(); ctx.fill();
    }
    // 远山与丛林之间的实心过渡带（挡住山峰"透缝"）
    ctx.fillStyle = '#5E8A94';
    ctx.fillRect(0, horizonY + 26, DW, 22);""", "远山压低 + 过渡带")

# 2) 叶尖朝上
rep("""            ctx.beginPath();
            ctx.moveTo(x1 - 3 * cam.zoom, y1);
            ctx.quadraticCurveTo(x1, y1 - 8 * cam.zoom, x1 + 3 * cam.zoom, y1);
            ctx.closePath(); ctx.fill();""",
"""            // 朝上生长的叶尖（不是朝下的刺）
            ctx.beginPath();
            ctx.moveTo(x1 - 3.4 * cam.zoom, y1 + 5 * cam.zoom);
            ctx.quadraticCurveTo(x1 + 0.6 * cam.zoom, y1 - 9 * cam.zoom, x1 + 3.4 * cam.zoom, y1 + 5 * cam.zoom);
            ctx.closePath(); ctx.fill();""", "叶尖朝上")

# 3) 计时条往左
rep("      ctx.fillStyle = 'rgba(16,22,28,.72)'; roundRect(DW - 210, 92, 186, 28, 6); ctx.fill();",
    "      ctx.fillStyle = 'rgba(10,18,24,.88)'; roundRect(DW - 222, 90, 190, 30, 8); ctx.fill();", "计时条左移")
rep("      text(state.run.time.toFixed(2) + ' s', DW - 44, 112, 16, '#ffd93d', 'right');",
    "      text(state.run.time.toFixed(2) + ' s', DW - 48, 111, 16, '#ffd93d', 'right');", "计时文字内缩")

p.write_text(t, encoding="utf-8")
print("done")

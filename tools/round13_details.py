"""第 13 轮：按参考视频补三样纯视觉元素

参考帧观察（BV1ayKTemEEb 0:28 / 1:36 / 2:32）：
1. **草皮和石头之间有一条很粗的纯黑线**（比我现在画的粗得多，视觉冲击力强）
2. 石头表面散落着**小碎石**（不规则小块，有高光）
3. 洞窟关**顶部垂下藤蔓**（细长的绿色/暗色须）

这三样都便宜、纯视觉、不影响物理。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) 草皮下方的粗黑线 ----------
rep("    band(PAL.edge, 16 * cam.zoom, 13 * cam.zoom);               // 草地整体暗边",
"""    // 草皮与石头之间的粗黑线（参考视频里非常显眼的一条）
    band('#0b1210', 22 * cam.zoom, 15 * cam.zoom);
    band(PAL.edge, 12 * cam.zoom, 11 * cam.zoom);               // 草地暗边""",
    "粗黑线")

# ---------- 2) 石头表面小碎石 ----------
rep("    // 地表材质带（沿同一条折线画粗线）",
"""    // 石头表面的小碎石（散落，带高光）
    {
      const pebW = 0;
      const yTop = toY(cam.y) + 30;
      const n = Math.ceil((VIEW_W + VIEW_OFF_X * 2) / 46);
      for (let row = 0; row < 9; row++) {
        for (let c2 = 0; c2 < n; c2++) {
          const h1 = Math.abs(Math.sin((c2 * 12.9898 + row * 78.233) * 43758.5453)) % 1;
          const h2 = Math.abs(Math.sin((c2 * 39.346 + row * 11.135) * 24634.6345)) % 1;
          if (h1 > 0.42) continue;
          const px = c2 * 46 + h1 * 40 - VIEW_OFF_X;
          const py = yTop + row * 62 + h2 * 46;
          if (py > DH + VIEW_OFF_Y) continue;
          const r2 = 3 + h2 * 5;
          ctx.beginPath();
          ctx.ellipse(px, py, r2 * 1.25, r2 * 0.8, h1 * 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(180,196,206,.30)'; ctx.fill();
          ctx.beginPath();
          ctx.ellipse(px - r2 * 0.25, py - r2 * 0.22, r2 * 0.55, r2 * 0.34, h1 * 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill();
        }
      }
    }

    // 地表材质带（沿同一条折线画粗线）""", "小碎石")

# ---------- 3) 洞窟顶部垂藤 ----------
rep("      const caveV = ctx.createRadialGradient(DW / 2, DH * 0.62, DH * 0.2, DW / 2, DH * 0.62, DW * 0.7);",
"""      // 顶部垂藤（细长，带轻微弯曲）
      ctx.strokeStyle = 'rgba(28,52,40,.75)';
      for (let vi = 0; vi < 18; vi++) {
        const hx = (vi / 17) * (VIEW_W + VIEW_OFF_X * 2) - VIEW_OFF_X + ((vi * 53) % 30);
        const vlen = 40 + ((vi * 71) % 110);
        const bend = ((vi % 3) - 1) * 12;
        ctx.lineWidth = 1.5 + ((vi * 37) % 3) * 0.8;
        ctx.beginPath();
        ctx.moveTo(hx, 0);
        ctx.quadraticCurveTo(hx + bend, vlen * 0.6, hx + bend * 1.6, vlen);
        ctx.stroke();
      }

      const caveV = ctx.createRadialGradient(DW / 2, DH * 0.62, DH * 0.2, DW / 2, DH * 0.62, DW * 0.7);""",
    "洞窟垂藤")

p.write_text(t, encoding="utf-8")
print("done")

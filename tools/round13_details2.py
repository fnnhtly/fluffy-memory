"""补小碎石和垂藤（按实际锚点）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def sub(a, b, tag):
    global t
    if a not in t:
        print("  MISS:", tag)
        return False
    t = t.replace(a, b, 1)
    print("  ok:", tag)
    return True


# 小碎石：插在"零星草叶"那段之前
anchor = "    // 零星草叶"
if anchor not in t:
    # 用 ASCII 特征：grass3 band 之后
    anchor = "band(PAL.grass3, 5 * cam.zoom, -2 * cam.zoom);"
    idx = t.find(anchor)
    assert idx > 0
    idx_end = t.find("\n", idx) + 1
    pebbles = """    // 石头表面的小碎石（散落，带高光）
    {
      const yTop = toY(cam.y) + 30;
      const n2 = Math.ceil((VIEW_W + VIEW_OFF_X * 2) / 46);
      for (let row = 0; row < 9; row++) {
        for (let c2 = 0; c2 < n2; c2++) {
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

"""
    t = t[:idx_end] + pebbles + t[idx_end:]
    print("  ok: 小碎石")

# 垂藤
sub("      const caveV = ctx.createRadialGradient(DW / 2, DH * 0.62, DH * 0.2, DW / 2, DH * 0.62, DW * 0.7);",
"""      // 顶部垂藤
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

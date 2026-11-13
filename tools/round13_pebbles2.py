"""修小碎石：之前用固定屏幕 Y 画，导致碎石飘在草地/天空上。

改成：按地形逐列生成碎石，Y 取该列地表以下的一定深度（保证一定在石头里）。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

start = t.find("    // 石头表面的小碎石（散落 + 高光）")
assert start > 0, "pebble block not found"
end = t.find("    // 零星草叶", start)
if end < 0:
    end = t.find("\n    }\n", start) + len("\n    }\n")
assert end > start

new_block = """    // 石头表面的小碎石（跟着地形走，一定在石头内部）
    {
      for (let i = 0; i < pts.length; i += 2) {
        const wx = pts[i][0];
        const h1 = Math.abs(Math.sin(wx * 12.9898) * 43758.5453) % 1;
        const h2 = Math.abs(Math.sin(wx * 39.346) * 24634.6345) % 1;
        if (h1 > 0.30) continue;
        const px = toX(wx);
        const surfY = toY(pts[i][1]);
        const depth = (18 + h2 * 90) * cam.zoom;      // 地表以下 18~108 px
        const py = surfY + depth;
        if (py > DH + VIEW_OFF_Y || py < surfY + 8 * cam.zoom) continue;
        const r2 = (2.5 + h2 * 4) * cam.zoom;
        ctx.beginPath();
        ctx.ellipse(px, py, r2 * 1.3, r2 * 0.8, h1 * 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(186,200,210,.22)'; ctx.fill();
        ctx.beginPath();
        ctx.ellipse(px - r2 * 0.25, py - r2 * 0.24, r2 * 0.55, r2 * 0.34, h1 * 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fill();
      }
    }

"""
t = t[:start] + new_block + t[end:]
p.write_text(t, encoding="utf-8")
print("小碎石改为跟随地形")

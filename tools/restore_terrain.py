"""重补 drawWorld 里丢失的"地形折线采样 + traceTerrain"段。

插在石头层之前（石头需要 pts 和 traceTerrain）。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

anchor = "    // ---------- 石块层"
if anchor not in t:
    anchor = "    // 石块"
i = t.find(anchor)
assert i > 0, "stone anchor not found"

# 找到该行行首
line_start = t.rfind("\n", 0, i) + 1

terrain = '''    // ---------- 地形：折线采样 ----------
    const leftW = cam.x - VIEW_W / 2 / s - 2, rightW = cam.x + VIEW_W / 2 / s + 2;
    const stepW = 5 / s;
    const pts = [];
    for (let x = leftW; x <= rightW; x += stepW) pts.push([x, ter.surfaceY(x)]);

    function traceTerrain(extraBottom) {
      ctx.beginPath();
      ctx.moveTo(toX(pts[0][0]), toY(pts[0][1]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(toX(pts[i][0]), toY(pts[i][1]));
      const bottomY = DH + VIEW_OFF_Y + (extraBottom || 40);
      ctx.lineTo(toX(pts[pts.length - 1][0]), bottomY);
      ctx.lineTo(toX(pts[0][0]), bottomY);
      ctx.closePath();
    }

    // 底色（深石头）
    traceTerrain();
    const rockDeep = ctx.createLinearGradient(0, toY(cam.y), 0, DH);
    rockDeep.addColorStop(0, '#3d4a56');
    rockDeep.addColorStop(1, '#2a3641');
    ctx.fillStyle = rockDeep; ctx.fill();

'''
t = t[:line_start] + terrain + t[line_start:]
p.write_text(t, encoding="utf-8")
print("地形折线段已补回")

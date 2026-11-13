"""把"地形折线采样 + 石块绘制"完整插回 drawWorld（在草皮带之前）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")
stone = pathlib.Path("records/stone-inner.txt").read_text(encoding="utf-8")

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

    // ---------- 石块纹理 ----------
'''

# 找到草皮带之前的插入点
anchor = "    // 草皮：暗边 → 暗草 → 亮草 → 高光 → 草叶"
if anchor not in t:
    anchor = "    band(PAL.edge, 16 * cam.zoom, 13 * cam.zoom);"
idx = t.find(anchor)
assert idx > 0, "grass anchor not found"
line_start = t.rfind("\n", 0, idx) + 1

t = t[:line_start] + terrain + stone.rstrip() + "\n\n" + t[line_start:]
p.write_text(t, encoding="utf-8")
print("地形 + 石块已插回")

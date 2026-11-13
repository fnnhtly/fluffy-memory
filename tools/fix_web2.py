"""渲染第二遍：地形改成"连续折线多边形"（不再一格一格画），并修零件槽/标签出界。

- 地形：沿 surfaceY(x) 每 6px 采样，填多边形到底部；草皮/冰面用沿折线的粗线 + 暗描边
- 远景丛林：圆冠压低、加一层深色
- 零件槽整体上移 24px，数量与名称都放进画布
- 撤销按钮挪到左上（清空按钮下方）
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

start = t.find("  function drawWorld(ter, cam) {")
end = t.find("  function drawGrid() {")
assert start > 0 and end > start

new_world = '''  function drawWorld(ter, cam) {
    const s = PPM * cam.zoom;
    const toX = wx => DW / 2 + (wx - cam.x) * s;
    const toY = wy => DH / 2 - (wy - cam.y) * s;

    // 天空
    const g = ctx.createLinearGradient(0, 0, 0, DH);
    g.addColorStop(0, '#e2f0a4');
    g.addColorStop(0.45, COL.sky);
    g.addColorStop(1, '#cfeb8e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);

    // 远景丛林：深色带 + 圆冠（压低，别抢前景）
    const horizonY = toY(ter.surfaceY(cam.x) + 2.6);
    ctx.fillStyle = COL.jungle;
    ctx.fillRect(0, Math.max(0, horizonY), DW, DH);
    ctx.fillStyle = COL.jungle2;
    for (let i = 0; i < 14; i++) {
      const bx = (i / 14) * DW + 16;
      const r = 34 + (i % 4) * 12;
      ctx.beginPath(); ctx.arc(bx, horizonY + 6, r, Math.PI, 0); ctx.fill();
    }
    ctx.fillStyle = 'rgba(30,80,40,.28)';
    ctx.fillRect(0, Math.max(0, horizonY + 10), DW, DH);

    // 地形：沿 surfaceY 采样成折线 → 一条多边形填到底
    const leftW = cam.x - DW / 2 / s - 2, rightW = cam.x + DW / 2 / s + 2;
    const stepW = 6 / s;
    const pts = [];
    for (let x = leftW; x <= rightW; x += stepW) pts.push([x, ter.surfaceY(x)]);
    ctx.beginPath();
    ctx.moveTo(toX(pts[0][0]), toY(pts[0][1]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(toX(pts[i][0]), toY(pts[i][1]));
    ctx.lineTo(toX(pts[pts.length - 1][0]), DH + 40);
    ctx.lineTo(toX(pts[0][0]), DH + 40);
    ctx.closePath();
    const rock = ctx.createLinearGradient(0, toY(cam.y), 0, DH);
    rock.addColorStop(0, '#8b95a2');
    rock.addColorStop(1, '#5b6672');
    ctx.fillStyle = rock; ctx.fill();

    // 地表材质带（沿同一条折线画粗线）
    function band(color, width, offset) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const x = toX(pts[i][0]), y = toY(pts[i][1]) + offset;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.stroke();
    }
    band(COL.grass, 14 * cam.zoom, 5 * cam.zoom);          // 草皮
    band(COL.shadow, 5 * cam.zoom, 13 * cam.zoom);         // 草皮阴影
    band('rgba(24,34,28,.85)', 3 * cam.zoom, 17 * cam.zoom); // 描边

    // 冰面：把冰列的地表再描一遍青色
    ctx.save();
    for (let i = 0; i < pts.length; i++) {
      if (ter.material[Math.max(0, Math.min(ter.cols - 1, Math.floor(pts[i][0])))] !== 'ice') continue;
      const x0 = toX(pts[i][0]);
      ctx.fillStyle = 'rgba(190,240,250,.85)';
      ctx.fillRect(x0 - stepW * s / 2, toY(pts[i][1]) + 1, stepW * s + 1, 6 * cam.zoom);
    }
    ctx.restore();
  }

'''
t = t[:start] + new_world + t[end:]

# 零件槽上移，标签放进画布
t = t.replace("    return { x: x0 + i * (w + gap), y: DH - 96, w, h: w };",
              "    return { x: x0 + i * (w + gap), y: DH - 118, w, h: w };")
t = t.replace("      text(part === 'eraser' ? '橡皮' : (left > 0 ? 'x' + left : 'x0'),\n"
              "        rect.x + rect.w / 2, rect.y + rect.h + 16, 12, left > 0 || part === 'eraser' ? '#e8f0e0' : '#ff9c86', 'center');\n"
              "      text(RAP.PARTS[part] ? RAP.PARTS[part].label : '橡皮', rect.x + rect.w / 2, rect.y + rect.h + 32, 11, '#9fb2c2', 'center');",
              "      text((part === 'eraser' ? '' : (left > 0 ? 'x' + left : 'x0')),\n"
              "        rect.x + rect.w - 6, rect.y + 14, 12, left > 0 || part === 'eraser' ? '#e8f0e0' : '#ff9c86', 'right');\n"
              "      text(RAP.PARTS[part] ? RAP.PARTS[part].label : '橡皮',\n"
              "        rect.x + rect.w / 2, rect.y + rect.h + 15, 12, '#dfe9f2', 'center');")

# 撤销按钮挪到左上（清空下方）
t = t.replace("      if (name === 'undo') return { x: DW - 176, y: DH - 196, w: 116, h: 40 };",
              "      if (name === 'undo') return { x: 40, y: DH / 2 + 52, w: 156, h: 40 };")

p.write_text(t, encoding="utf-8")
print("index.html: 地形折线化 + 零件槽布局")

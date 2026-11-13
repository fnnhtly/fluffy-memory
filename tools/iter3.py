"""小修：秒表指针画成真正的指针（原来是 L 形），草皮带减薄一档。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

old = """    ctx.fillStyle = '#6a5410';
    ctx.fillRect(bx[2] - 2, by - 18, 4, 20);
    ctx.fillRect(bx[2] - 2, by - 2, 12, 4);"""
new = """    // 秒表指针：分针从圆心向上，指针从圆心斜向
    ctx.strokeStyle = '#6a5410'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx[2], by); ctx.lineTo(bx[2], by - 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx[2], by); ctx.lineTo(bx[2] + 13, by + 7); ctx.stroke();
    ctx.fillStyle = '#6a5410';
    ctx.beginPath(); ctx.arc(bx[2], by, 3.5, 0, Math.PI * 2); ctx.fill();"""
assert old in t
t = t.replace(old, new)

# 草皮/描边减薄
t = t.replace("    band(COL.grass, 14 * cam.zoom, 5 * cam.zoom);          // 草皮",
              "    band(COL.grass, 10 * cam.zoom, 4 * cam.zoom);          // 草皮")
t = t.replace("    band(COL.shadow, 5 * cam.zoom, 13 * cam.zoom);         // 草皮阴影",
              "    band(COL.shadow, 4 * cam.zoom, 10 * cam.zoom);         // 草皮阴影")
t = t.replace("    band('rgba(18,26,22,.95)', 7 * cam.zoom, 19 * cam.zoom); // 重描边",
              "    band('rgba(18,26,22,.95)', 5 * cam.zoom, 14 * cam.zoom); // 重描边")

p.write_text(t, encoding="utf-8")
print("秒表指针 + 草皮减薄")

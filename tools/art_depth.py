"""补景深：近景丛林和地形之间出现一条"沙地/泥地"（现在直接露草皮，很空），
并把近景丛林的叶尖收小、底部加阴影带，让层次更像参考视频。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 1) 叶尖缩小（现在太夸张）
t = t.replace("            ctx.moveTo(x1 - 4 * cam.zoom, y1);\n"
              "            ctx.quadraticCurveTo(x1, y1 - 13 * cam.zoom, x1 + 4 * cam.zoom, y1);",
              "            ctx.moveTo(x1 - 3 * cam.zoom, y1);\n"
              "            ctx.quadraticCurveTo(x1, y1 - 8 * cam.zoom, x1 + 3 * cam.zoom, y1);")

# 2) 近景丛林下方加一层地面过渡（远处泥地 + 近处草皮）
anchor = "    // ---------- 地形：折线采样 ----------"
assert anchor in t
add = '''    // 远景地面过渡带（近景丛林脚下一层泥地，避免草皮直接接丛林）
    ctx.fillStyle = '#6b7a52';
    ctx.fillRect(0, horizonY + 118, DW, Math.max(0, toY(ter.surfaceY(cam.x)) - (horizonY + 118)) + 6);
    const gTrans = ctx.createLinearGradient(0, horizonY + 118, 0, toY(ter.surfaceY(cam.x)) + 6);
    gTrans.addColorStop(0, 'rgba(40,70,50,.55)');
    gTrans.addColorStop(1, 'rgba(40,70,50,0)');
    ctx.fillStyle = gTrans;
    ctx.fillRect(0, horizonY + 118, DW, Math.max(0, toY(ter.surfaceY(cam.x)) - (horizonY + 118)) + 6);

''' + anchor
t = t.replace(anchor, add)
p.write_text(t, encoding="utf-8")
print("景深过渡层已加")

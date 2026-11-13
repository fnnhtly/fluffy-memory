"""石纹第二遍：参考视频的石头是**深青灰、大块、圆润、黑缝明显**，
不是亮灰六边形。改：更暗的色板、更大的块、更不规则（每块 5~8 边、半径扰动更大）、
亮面集中在上半、底部压暗。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

old_start = t.find("    const stoneW = 46 * cam.zoom, stoneH = 30 * cam.zoom;")
old_end = t.find("    ctx.restore();\n\n    // 地表材质带", old_start)
assert old_start > 0 and old_end > old_start

new_stone = '''    const stoneW = 62 * cam.zoom, stoneH = 40 * cam.zoom;
    const baseY = toY(cam.y) + 14;
    const colsN = Math.ceil(DW / stoneW) + 3;
    const rowsN = Math.ceil((DH - baseY) / stoneH) + 3;
    for (let row = 0; row < rowsN; row++) {
      for (let col = 0; col < colsN; col++) {
        const ox = (col - 1) * stoneW + (row % 2) * stoneW * 0.5;
        const oy = baseY + row * stoneH;
        const jx = (hash(col, row) - 0.5) * stoneW * 0.34;
        const jy = (hash(col + 99, row + 7) - 0.5) * stoneH * 0.30;
        const cx2 = ox + jx, cy2 = oy + jy;
        const rw = stoneW * (0.46 + hash(col + 3, row + 11) * 0.14);
        const rh = stoneH * (0.44 + hash(col + 5, row + 13) * 0.14);
        const N = 5 + Math.floor(hash(col + 21, row + 17) * 4);
        const poly = [];
        for (let k = 0; k < N; k++) {
          const a = (k / N) * Math.PI * 2 + hash(col + k, row + k) * 0.5;
          const rr = 1 + (hash(col * 7 + k, row * 3 + k) - 0.5) * 0.42;
          poly.push([cx2 + Math.cos(a) * rw * rr, cy2 + Math.sin(a) * rh * rr]);
        }
        // 主体：深青灰，越往下越暗
        ctx.beginPath();
        poly.forEach((pt, k) => k === 0 ? ctx.moveTo(pt[0], pt[1]) : ctx.lineTo(pt[0], pt[1]));
        ctx.closePath();
        const depth = Math.min(1, (cy2 - baseY) / (DH - baseY + 1));
        const l1 = Math.round(96 - depth * 40), g1 = Math.round(112 - depth * 40), b1 = Math.round(120 - depth * 38);
        ctx.fillStyle = 'rgb(' + l1 + ',' + g1 + ',' + b1 + ')';
        ctx.fill();
        // 亮面：上半部分提亮
        ctx.save();
        ctx.beginPath();
        poly.forEach((pt, k) => k === 0 ? ctx.moveTo(pt[0], pt[1]) : ctx.lineTo(pt[0], pt[1]));
        ctx.closePath(); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,.16)';
        ctx.beginPath();
        ctx.ellipse(cx2 - rw * 0.1, cy2 - rh * 0.45, rw * 0.8, rh * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // 底部压暗
        ctx.fillStyle = 'rgba(8,14,20,.30)';
        ctx.beginPath();
        ctx.ellipse(cx2, cy2 + rh * 0.6, rw * 0.9, rh * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 黑缝
        ctx.strokeStyle = 'rgba(10,18,24,.72)';
        ctx.lineWidth = Math.max(1.4, 2.8 * cam.zoom);
        ctx.beginPath();
        poly.forEach((pt, k) => k === 0 ? ctx.moveTo(pt[0], pt[1]) : ctx.lineTo(pt[0], pt[1]));
        ctx.closePath(); ctx.stroke();
      }
    }
'''
t = t[:old_start] + new_stone + t[old_end:]
p.write_text(t, encoding="utf-8")
print("石纹第二遍完成")

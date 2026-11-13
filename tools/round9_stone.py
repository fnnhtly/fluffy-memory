"""第 9 轮 A：石头块感向参考靠拢

参考视频（BV1ayKTemEEb）的石头特征：
- **块更大**、更圆润（不是棱角分明的多边形）
- 缝更宽更深（黑色），块之间有明显"堆叠"感
- 每块有明确的上亮下暗渐变，不是平板色

改动：
1. 石头尺寸 62×40 → 78×52（更大块）
2. 多边形改成 7~10 边、半径扰动减小（更圆润）
3. 黑缝加宽（2.8 → 4.2 缩放）并加深
4. 每块加内部径向渐变（顶部亮、底部暗）
5. 块与块之间加 1px 的高光边（模拟堆叠的受光）
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 尺寸更大更圆
rep("    const stoneW = 62 * cam.zoom, stoneH = 40 * cam.zoom;",
    "    const stoneW = 78 * cam.zoom, stoneH = 52 * cam.zoom;", "石块更大")

rep("        const N = 5 + Math.floor(hash(col + 21, row + 17) * 4);",
    "        const N = 7 + Math.floor(hash(col + 21, row + 17) * 4);   // 7~10 边，更圆润",
    "边数增加")

rep("          const rr = 1 + (hash(col * 7 + k, row * 3 + k) - 0.5) * 0.42;",
    "          const rr = 1 + (hash(col * 7 + k, row * 3 + k) - 0.5) * 0.22;  // 扰动减小 → 更圆",
    "扰动减小")

rep("        const rw = stoneW * (0.46 + hash(col + 3, row + 11) * 0.14);\n"
    "        const rh = stoneH * (0.44 + hash(col + 5, row + 13) * 0.14);",
    "        const rw = stoneW * (0.50 + hash(col + 3, row + 11) * 0.10);\n"
    "        const rh = stoneH * (0.48 + hash(col + 5, row + 13) * 0.10);",
    "块更饱满")

# 2) 内部径向渐变 + 更深的缝
rep("""        ctx.fillStyle = 'rgb(' + l1 + ',' + g1 + ',' + b1 + ')';
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
        ctx.closePath(); ctx.stroke();""",
"""        // 主体 + 内部径向渐变（中心亮、边缘暗 → 圆润的立体感）
        const rg = ctx.createRadialGradient(
          cx2 - rw * 0.22, cy2 - rh * 0.34, rh * 0.12,
          cx2, cy2, rw * 1.05);
        rg.addColorStop(0, 'rgb(' + Math.min(255, l1 + 34) + ',' + Math.min(255, g1 + 32) + ',' + Math.min(255, b1 + 30) + ')');
        rg.addColorStop(0.55, 'rgb(' + l1 + ',' + g1 + ',' + b1 + ')');
        rg.addColorStop(1, 'rgb(' + Math.max(0, l1 - 34) + ',' + Math.max(0, g1 - 32) + ',' + Math.max(0, b1 - 30) + ')');
        ctx.beginPath();
        poly.forEach((pt, k) => k === 0 ? ctx.moveTo(pt[0], pt[1]) : ctx.lineTo(pt[0], pt[1]));
        ctx.closePath();
        ctx.fillStyle = rg; ctx.fill();

        // 顶部受光边（堆叠高光）
        ctx.save();
        ctx.beginPath();
        poly.forEach((pt, k) => k === 0 ? ctx.moveTo(pt[0], pt[1]) : ctx.lineTo(pt[0], pt[1]));
        ctx.closePath(); ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,.22)';
        ctx.lineWidth = Math.max(1.5, 2.2 * cam.zoom);
        ctx.beginPath();
        for (let k = 0; k < poly.length; k++) {
          const pt = poly[k];
          if (pt[1] > cy2 - rh * 0.15) continue;     // 只画上半部分
          k === 0 ? ctx.moveTo(pt[0], pt[1]) : ctx.lineTo(pt[0], pt[1]);
        }
        ctx.stroke();
        ctx.restore();

        // 缝：更宽更深
        ctx.strokeStyle = 'rgba(6,12,18,.85)';
        ctx.lineWidth = Math.max(2, 4.2 * cam.zoom);
        ctx.beginPath();
        poly.forEach((pt, k) => k === 0 ? ctx.moveTo(pt[0], pt[1]) : ctx.lineTo(pt[0], pt[1]));
        ctx.closePath(); ctx.stroke();""", "径向渐变 + 深缝")

p.write_text(t, encoding="utf-8")
print("石头重做完成")

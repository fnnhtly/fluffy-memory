"""性能优化（保守方案）：降低每帧绘制调用量，不改变架构。

瓶颈：石头 240 块 × 5 次调用 ≈ 1200 次/帧（占 80%）。
不动架构，只做三件事：
1. **石头块数减半**：尺寸 78×52 → 108×72（块更大，视觉密度不变但数量减 40%）
2. **每块少画一次**：去掉"受光弧"（改用渐变本身的表现，视觉差别很小）
3. **小碎石减半**：采样步长 ×2
4. **画布缓存 DPR**：限制最多 1.5 倍（4K 屏上别画 2 倍）
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 石头更大（数量减少 40%）
rep("    const stoneW = 78 * cam.zoom, stoneH = 52 * cam.zoom;",
    "    const stoneW = 108 * cam.zoom, stoneH = 72 * cam.zoom;", "石头 108×72")

# 2) 去掉每块的"受光边"描边（省 1/5 调用）
rep("""        // 顶部受光边（堆叠高光）
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

""", "", "去掉受光边")

# 3) 小碎石步长 ×2
rep("      for (let i = 0; i < pts.length; i += 2) {",
    "      for (let i = 0; i < pts.length; i += 4) {", "碎石减半")

# 4) DPR 上限 1.5
rep("    const dpr = Math.min(2, window.devicePixelRatio || 1);",
    "    const dpr = Math.min(1.5, window.devicePixelRatio || 1);   // 性能：4K 屏别画 2 倍", "DPR ≤1.5")

p.write_text(t, encoding="utf-8")
print("done")

"""第 11 轮 B：零件厚重感（参考视频里木框/轮子是"厚木板"的质感）

现在零件偏平。加三样：
1) **投影**：每个零件下方一层偏移的深色影子（不是接触阴影，是零件自身的投影）
2) **内阴影**：木框内壁再加深一档，制造"厚"的厚度感
3) **轮子厚度**：轮子外圈加一层暗色描边 + 内侧亮环，看起来是圆柱不是圆片
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) drawPartShape 开头加投影（用 ctx.shadow* 最简单且不影响已有绘制顺序）
rep("""    const h = size / 2;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate((dir || 0) * Math.PI / 2);""",
"""    const h = size / 2;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate((dir || 0) * Math.PI / 2);
    // 零件自身投影（厚重感第一步：离地感）
    if (def.structure || def.wheel || def.motor || def.energy || def.interactive) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#0a1016';
      ctx.translate(size * 0.06, size * 0.08);
      if (def.wheel) {
        ctx.beginPath(); ctx.arc(0, 0, h * 0.98, 0, Math.PI * 2); ctx.fill();
      } else {
        roundRect(-h * 0.94, -h * 0.94, size * 0.94, size * 0.94, Math.max(3, size * 0.08));
        ctx.fill();
      }
      ctx.restore();
    }""", "零件投影")

# 2) 木框内壁再深一档
rep("      // 内壁阴影（凹进去的深度）\n"
    "      ctx.strokeStyle = 'rgba(58,38,18,.6)'; ctx.lineWidth = Math.max(1.5, size * 0.05);\n"
    "      ctx.strokeRect(-h + bw, -h + bw, size - bw * 2, size - bw * 2);",
    "      // 内壁阴影（双重：外圈深、内圈更深 → 厚度感）\n"
    "      ctx.strokeStyle = 'rgba(58,38,18,.55)'; ctx.lineWidth = Math.max(2, size * 0.085);\n"
    "      ctx.strokeRect(-h + bw, -h + bw, size - bw * 2, size - bw * 2);\n"
    "      ctx.strokeStyle = 'rgba(28,16,6,.45)'; ctx.lineWidth = Math.max(1, size * 0.04);\n"
    "      ctx.strokeRect(-h + bw * 1.25, -h + bw * 1.25, size - bw * 2.5, size - bw * 2.5);",
    "木框双重内壁")

# 3) 轮子厚度：外圈暗描边 + 内侧亮环
rep("      // 高光弧\n"
    "      ctx.strokeStyle = 'rgba(255,255,255,.32)';\n"
    "      ctx.lineWidth = Math.max(1, size * 0.05);\n"
    "      ctx.beginPath(); ctx.arc(0, 0, h * 0.6, -2.5, -0.9); ctx.stroke();",
    "      // 外缘暗描边（圆柱侧壁感）\n"
    "      ctx.strokeStyle = 'rgba(8,14,20,.85)';\n"
    "      ctx.lineWidth = Math.max(2, size * 0.075);\n"
    "      ctx.beginPath(); ctx.arc(0, 0, h * 0.97, 0, Math.PI * 2); ctx.stroke();\n"
    "      // 内侧亮环（受光的圆柱内壁）\n"
    "      ctx.strokeStyle = isIron ? 'rgba(255,255,255,.28)' : 'rgba(255,235,200,.30)';\n"
    "      ctx.lineWidth = Math.max(1.2, size * 0.035);\n"
    "      ctx.beginPath(); ctx.arc(0, 0, h * 0.82, 0, Math.PI * 2); ctx.stroke();\n"
    "      // 高光弧\n"
    "      ctx.strokeStyle = 'rgba(255,255,255,.32)';\n"
    "      ctx.lineWidth = Math.max(1, size * 0.05);\n"
    "      ctx.beginPath(); ctx.arc(0, 0, h * 0.6, -2.5, -0.9); ctx.stroke();",
    "轮子厚度")

p.write_text(t, encoding="utf-8")
print("零件厚重感完成")

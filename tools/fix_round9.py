"""最后打磨：箭头更粗更长（深色描边打底），打气筒图标更像"打气筒"。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 箭头：更长更粗 + 深色描边
rep("    const len = size * 0.66;                     // 伸出格子外",
    "    const len = size * 0.98;                     // 明显伸出格子外", "箭头更长")
rep("    const head = size * 0.26;", "    const head = size * 0.34;", "箭头更大")
rep("""    // 箭杆：白色包边 + 本体色
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = glow ? 10 : 8;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = glow ? 6 : 4.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();""",
"""    // 箭杆：深色打底 → 白边 → 本体色（三种背景都看得清）
    ctx.strokeStyle = 'rgba(16,26,20,.85)'; ctx.lineWidth = glow ? 13 : 11;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = glow ? 9 : 7;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = glow ? 6 : 5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();""",
    "箭杆三层描边")
rep("""    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2; ctx.stroke();""",
"""    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = 'rgba(16,26,20,.85)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.2; ctx.stroke();""",
    "箭头深色描边")

# 打气筒图标：筒身 + 活塞杆 + 出气口
rep("""    } else if (def.interactive) {
      // 打气筒：筒 + 活塞
      ctx.fillStyle = '#2f5e78'; roundRect(-h * 0.3, -h * 0.62, size * 0.3, size * 0.62, 3); ctx.fill();
      ctx.fillStyle = def.color; roundRect(-h * 0.38, -h * 0.72, size * 0.38, size * 0.2, 3); ctx.fill();
      ctx.fillStyle = '#e8f4ff'; ctx.fillRect(-h * 0.66, -h * 0.2, size * 0.34, size * 0.09);
    } else {""",
"""    } else if (def.interactive) {
      // 打气筒：竖筒 + 顶部活塞杆 + 右侧出气管（朝向由 dir 旋转）
      ctx.fillStyle = '#2f5e78'; roundRect(-h * 0.34, -h * 0.5, size * 0.34, size * 0.62, 4); ctx.fill();
      ctx.fillStyle = '#cfe6f2'; roundRect(-h * 0.34, -h * 0.5, size * 0.1, size * 0.62, 3); ctx.fill();
      ctx.fillStyle = def.color; roundRect(-h * 0.42, -h * 0.72, size * 0.5, size * 0.2, 4); ctx.fill();
      ctx.strokeStyle = '#1d3a4a'; ctx.lineWidth = Math.max(1.5, size * 0.05);
      roundRect(-h * 0.42, -h * 0.72, size * 0.5, size * 0.2, 4); ctx.stroke();
      // 出气管 + 管口
      ctx.fillStyle = '#8fb8cc';
      ctx.fillRect(-h * 0.02, h * 0.02, size * 0.34, size * 0.14);
      ctx.fillStyle = '#e8f4ff';
      ctx.beginPath(); ctx.arc(h * 0.34, h * 0.09, size * 0.09, 0, Math.PI * 2); ctx.fill();
    } else {""", "打气筒图标")

p.write_text(t, encoding="utf-8")
print("done")

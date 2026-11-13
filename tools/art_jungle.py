"""画质第二轮：丛林改成三层剪影 + 天空加云 + 地平线光晕。
参考视频里背景是：远山（最淡）→ 中景丛林（中）→ 近景丛林（最实，带叶尖），
每层之间都有一层薄雾。之前只有一层圆冠，所以看着平。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# ---------- 替换丛林段 ----------
s0 = t.find("    // 远景丛林：深色带 + 圆冠（压低，别抢前景）")
s1 = t.find("    // 地形：折线采样", s0) if s0 > 0 else -1
if s1 < 0:
    s1 = t.find("    // ---------- 地形：折线采样 ----------", s0)
assert s0 > 0 and s1 > s0, "jungle block not found"

new_jungle = '''    // ---------- 丛林：三层剪影 ----------
    function canopy(baseY2, r0, dy, color, alpha, leafy) {
      ctx.save();
      ctx.globalAlpha = alpha;
      const n = Math.ceil(DW / (r0 * 1.5)) + 3;
      for (let i = 0; i < n; i++) {
        const bx = (i - 1) * r0 * 1.5 + (i % 2) * r0 * 0.4;
        const rr = r0 * (0.75 + ((i * 37) % 11) / 22);
        const by = baseY2 + dy - ((i * 53) % 9) * 1.6;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(bx, by, rr, Math.PI, 0); ctx.fill();
        // 叶尖（近景层才画）
        if (leafy) {
          for (let k = 0; k < 7; k++) {
            const a2 = -Math.PI + (k / 6) * Math.PI;
            const x1 = bx + Math.cos(a2) * rr * 0.96;
            const y1 = by + Math.sin(a2) * rr * 0.96;
            ctx.beginPath();
            ctx.moveTo(x1 - 4 * cam.zoom, y1);
            ctx.quadraticCurveTo(x1, y1 - 13 * cam.zoom, x1 + 4 * cam.zoom, y1);
            ctx.closePath(); ctx.fill();
          }
        }
      }
      ctx.restore();
    }

    const horizonY = toY(ter.surfaceY(cam.x) + 2.6);
    // 远山（最淡，最高）
    ctx.fillStyle = '#33566b';
    for (let i = 0; i < 7; i++) {
      const bx = i * 220 - 120, hh = 120 - (i % 3) * 26;
      ctx.beginPath();
      ctx.moveTo(bx, horizonY + 30);
      ctx.lineTo(bx + 130, horizonY + 30 - hh);
      ctx.lineTo(bx + 260, horizonY + 30);
      ctx.closePath(); ctx.fill();
    }
    // 远景丛林（淡）
    canopy(horizonY + 34, 42, 0, '#3f7f5c', 0.9, false);
    // 中景丛林（中）
    canopy(horizonY + 62, 50, 6, '#2f6b4a', 0.96, false);
    // 中景与近景之间的雾
    const fogM = ctx.createLinearGradient(0, horizonY + 40, 0, horizonY + 130);
    fogM.addColorStop(0, 'rgba(226,240,210,0)');
    fogM.addColorStop(0.5, 'rgba(226,240,210,.32)');
    fogM.addColorStop(1, 'rgba(226,240,210,0)');
    ctx.fillStyle = fogM; ctx.fillRect(0, horizonY + 40, DW, 100);
    // 近景丛林（最实，带叶尖）
    canopy(horizonY + 96, 58, 10, '#22503a', 1, true);

    // 棕榈剪影
    function palm(px, py, scale, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#16382a'; ctx.lineWidth = 6 * scale; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + 7 * scale, py - 50 * scale, px + 2 * scale, py - 92 * scale);
      ctx.stroke();
      ctx.strokeStyle = '#1c4432'; ctx.lineWidth = 9 * scale;
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (k - 3) * 0.46;
        ctx.beginPath();
        ctx.moveTo(px + 2 * scale, py - 92 * scale);
        ctx.quadraticCurveTo(
          px + Math.cos(a) * 36 * scale, py - 92 * scale + Math.sin(a) * 22 * scale - 14 * scale,
          px + Math.cos(a) * 60 * scale, py - 92 * scale + Math.sin(a) * 38 * scale + 8 * scale);
        ctx.stroke();
      }
      ctx.restore();
    }
    const palmBase = horizonY + 104;
    palm(DW * 0.10, palmBase, 1.05, 0.92);
    palm(DW * 0.24, palmBase + 8, 0.82, 0.8);
    palm(DW * 0.72, palmBase + 4, 0.98, 0.88);
    palm(DW * 0.87, palmBase + 12, 0.78, 0.78);

'''
t = t[:s0] + new_jungle + t[s1:]
p.write_text(t, encoding="utf-8")
print("丛林三层重做完成")

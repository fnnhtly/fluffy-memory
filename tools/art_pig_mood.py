"""小猪表情演出系统（参考视频的主要笑点）：
- 6 种表情：normal（默认）/ happy（吃箱/过关）/ scared（高速/腾空）/ hurt（受伤）/ dizzy（刚撞）/ dead（掉队）
- 表情由运行状态驱动，不需要改物理：读速度、pigHP、box 增量、刚撞击
- 附加演出：眨眼（周期性）、耳朵摆动（随速度）、受击时上下抖动
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# ---------- 替换 drawPig ----------
s0 = t.find("  function drawPig(cx, cy, r, angle, hurt) {")
s1 = t.find("  function drawPartShape(part, cx, cy, size, dir, hp) {")
assert s0 > 0 and s1 > s0

new_pig = '''  // mood: 'normal' | 'happy' | 'scared' | 'hurt' | 'dizzy' | 'dead'
  function drawPig(cx, cy, r, angle, mood, extra) {
    mood = mood || 'normal';
    extra = extra || {};
    const tNow = performance.now() / 1000;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(angle || 0);
    // 受击抖动
    if (extra.shake) {
      ctx.translate(Math.sin(tNow * 70) * r * 0.08, Math.cos(tNow * 63) * r * 0.06);
    }

    // 耳朵（随速度摆动）
    const earSwing = Math.sin(tNow * 3.2) * (extra.earSwing || 0) * r * 0.1;
    ctx.fillStyle = '#5fae4c';
    for (const sx of [-1, 1]) {
      ctx.save();
      ctx.translate(sx * r * 0.58, -r * 0.8 + earSwing * sx);
      ctx.rotate(sx * 0.12 + earSwing * 0.4);
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.27, r * 0.31, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a8dd94';
      ctx.beginPath(); ctx.ellipse(0, r * 0.04, r * 0.14, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5fae4c';
      ctx.restore();
    }

    // 头
    ctx.fillStyle = COL.pig;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    // 头顶高光（体积感）
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.45, r * 0.5, r * 0.28, -0.3, 0, Math.PI * 2); ctx.fill();
    // 腮红
    ctx.fillStyle = 'rgba(232,120,120,.32)';
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(sx * r * 0.6, r * 0.2, r * 0.2, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    }

    // ---- 眼睛（表情主体）----
    const eyeY = -r * 0.14;
    const EX = [-r * 0.34, r * 0.34];
    ctx.lineCap = 'round';
    if (mood === 'dead') {
      // × 眼 + 小舌头
      ctx.strokeStyle = '#1d2b1a'; ctx.lineWidth = Math.max(2, r * 0.12);
      for (const ex of EX) {
        ctx.beginPath();
        ctx.moveTo(ex - r * 0.15, eyeY - r * 0.15); ctx.lineTo(ex + r * 0.15, eyeY + r * 0.15);
        ctx.moveTo(ex + r * 0.15, eyeY - r * 0.15); ctx.lineTo(ex - r * 0.15, eyeY + r * 0.15);
        ctx.stroke();
      }
    } else if (mood === 'hurt' || mood === 'dizzy') {
      // >< 眼
      ctx.strokeStyle = '#1d2b1a'; ctx.lineWidth = Math.max(2, r * 0.11);
      for (const [i, ex] of EX.entries()) {
        const dir = i === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(ex - dir * r * 0.15, eyeY - r * 0.14);
        ctx.lineTo(ex + dir * r * 0.12, eyeY);
        ctx.lineTo(ex - dir * r * 0.15, eyeY + r * 0.14);
        ctx.stroke();
      }
      // 眩晕星星
      if (mood === 'dizzy') {
        for (let k = 0; k < 3; k++) {
          const a2 = tNow * 3 + k * 2.1;
          const sx2 = Math.cos(a2) * r * 0.55, sy2 = -r * 1.15 + Math.sin(a2) * r * 0.16;
          ctx.fillStyle = '#ffd93d';
          ctx.beginPath();
          for (let q = 0; q < 10; q++) {
            const ang = -Math.PI / 2 + q * Math.PI / 5;
            const rad = (q % 2 === 0) ? r * 0.16 : r * 0.07;
            const px2 = sx2 + Math.cos(ang) * rad, py2 = sy2 + Math.sin(ang) * rad;
            q === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
          }
          ctx.closePath(); ctx.fill();
        }
      }
    } else if (mood === 'scared') {
      // 大眼 + 小瞳孔 + 眉毛
      for (const ex of EX) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(ex, eyeY, r * 0.19, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1d2b1a';
        ctx.beginPath(); ctx.arc(ex, eyeY - r * 0.02, r * 0.085, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath(); ctx.arc(ex + r * 0.03, eyeY - r * 0.07, r * 0.03, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = '#1d2b1a'; ctx.lineWidth = Math.max(1.6, r * 0.07);
      for (const [i, ex] of EX.entries()) {
        const dir = i === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(ex - dir * r * 0.2, eyeY - r * 0.3);
        ctx.lineTo(ex + dir * r * 0.16, eyeY - r * 0.24);
        ctx.stroke();
      }
    } else if (mood === 'happy') {
      // ^ ^ 眼 + 张嘴笑
      ctx.strokeStyle = '#1d2b1a'; ctx.lineWidth = Math.max(2, r * 0.11);
      for (const ex of EX) {
        ctx.beginPath();
        ctx.arc(ex, eyeY + r * 0.06, r * 0.15, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
    } else {
      // normal：圆眼 + 眨眼
      const blink = (tNow % 3.6) > 3.45;
      ctx.fillStyle = '#1d2b1a';
      if (blink) {
        for (const ex of EX) {
          ctx.fillRect(ex - r * 0.14, eyeY - r * 0.02, r * 0.28, r * 0.07);
        }
      } else {
        for (const ex of EX) {
          ctx.beginPath(); ctx.arc(ex, eyeY, r * 0.135, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        for (const ex of EX) {
          ctx.beginPath(); ctx.arc(ex + r * 0.05, eyeY - r * 0.05, r * 0.045, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // ---- 嘴 / 鼻 ----
    ctx.fillStyle = '#8fd07a';
    ctx.beginPath(); ctx.ellipse(0, r * 0.3, r * 0.32, r * 0.23, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4d7a44';
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.arc(sx * r * 0.11, r * 0.3, r * 0.065, 0, Math.PI * 2); ctx.fill();
    }
    // 张开的嘴（开心/惊恐）
    if (mood === 'happy' || mood === 'scared') {
      ctx.fillStyle = '#7a3b3b';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.62, r * 0.2, r * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

'''
t = t[:s0] + new_pig + t[s1:]
p.write_text(t, encoding="utf-8")
print("小猪表情系统完成")

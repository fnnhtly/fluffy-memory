"""渲染层消费 touch 分级事件：尘土 + 震屏 + 音效。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 音效：分级触地音
rep("      rollStop() {",
"""      thud(lvl) {
        // 分级触地音：级别越高越低越沉
        const base = [0, 420, 320, 220, 150][Math.min(4, lvl)] || 300;
        tone(base, 0.05 + lvl * 0.02, 'sine', 0.03 + lvl * 0.02, base * 0.6);
        if (lvl >= 3) noise(0.10 + lvl * 0.03, 0.03 + lvl * 0.015);
      },
      rollStop() {""", "thud 音效")

# 2) 在事件轮询里处理 touch
rep("""              if (evs[i].indexOf('impact') === 0) {
                state.slowmo = 0.35;
                state.shake = Math.min(1.4, state.shake + 0.85);
                state.flash = 1;
                state.vignette = 1;
                spawnDebris(state.run.car.x, state.run.car.y + 0.4);
              }""",
"""              if (evs[i].indexOf('impact') === 0) {
                state.slowmo = 0.35;
                state.shake = Math.min(1.4, state.shake + 0.85);
                state.flash = 1;
                state.vignette = 1;
                spawnDebris(state.run.car.x, state.run.car.y + 0.4);
              } else if (evs[i].indexOf('touch lvl=') === 0) {
                // 分级接触反馈
                const lv = parseInt(evs[i].split('lvl=')[1], 10) || 1;
                const mx = evs[i].match(/x=([\d.]+)/);
                const px = mx ? parseFloat(mx[1]) : state.run.car.x;
                const strengths = [0, 0.10, 0.22, 0.42, 0.85];
                state.shake = Math.min(1.2, state.shake + strengths[lv]);
                if (lv >= 3) { state.flash = Math.max(state.flash, 0.35); }
                if (lv >= 2) { state.vignette = Math.max(state.vignette, lv >= 3 ? 0.7 : 0.25); }
                // 尘土：级别 1~2 个小，3~4 用碎片
                const n = [0, 3, 5, 8, 10][lv] || 3;
                if (lv >= 3) spawnDebris(px, state.run.car.y + 0.2);
                spawnDust(px, state.run.car.y - 0.3, n);
                SFX.thud(lv);
              }""", "消费 touch 事件")

# 3) 尘土粒子系统
rep("  function drawDebris(cam) {",
"""  function spawnDust(wx, wy, n) {
    for (let i = 0; i < n; i++) {
      state.dust = state.dust || [];
      state.dust.push({
        x: wx + (Math.random() - 0.5) * 0.5,
        y: wy + Math.random() * 0.15,
        vx: (Math.random() - 0.5) * 2.2,
        vy: 0.6 + Math.random() * 1.4,
        r: 2 + Math.random() * 3.5,
        life: 0.35 + Math.random() * 0.3,
        maxLife: 0.65
      });
    }
  }

  function drawDust(cam) {
    if (!state.dust || !state.dust.length) return;
    state.dust.forEach(d => {
      const p = worldToScreen(d.x, d.y, cam);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(0.5, d.life / d.maxLife * 0.5));
      ctx.fillStyle = '#d8cfb0';
      ctx.beginPath();
      ctx.arc(p.x, p.y, d.r * (1.6 - d.life / d.maxLife), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawDebris(cam) {""", "尘土系统")

# 4) 每帧推进尘土
rep("""      // 纸花：抛物线 + 摇曳 + 淡出""",
"""      // 尘土：上浮 + 扩散 + 淡出
      if (state.dust && state.dust.length) {
        state.dust.forEach(d => {
          d.vy -= 2.2 * dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.vx *= (1 - 2.2 * dt);
          d.life -= dt;
        });
        state.dust = state.dust.filter(d => d.life > 0);
      }
      // 纸花：抛物线 + 摇曳 + 淡出""", "尘土推进")

# 5) 绘制尘土
rep("    drawDebris(cam);", "    drawDebris(cam);\n    drawDust(cam);", "画尘土")

# 6) 状态位
rep("    confetti: [], starSfxIdx: -1,", "    confetti: [], dust: [], starSfxIdx: -1,", "尘土状态")

p.write_text(t, encoding="utf-8")
print("done")

"""第 6 轮 B：通关庆祝演出 + 音效分层

1) 通关瞬间：镜头推近（zoom 1.9）、慢动作 0.7 秒、纸花粒子上抛
2) 星标逐颗弹出时各配一声（音高递增）
3) 轮子滚动环境音：速度 > 2 m/s 时按速度调制一个持续低音
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) 音效：新增滚轮环境音 + 星星音 ----------
rep("      hurt() { tone(160, 0.16, 'square', 0.08, 90); }",
"""      hurt() { tone(160, 0.16, 'square', 0.08, 90); },
      star(n) { tone(660 + (n || 0) * 220, 0.12, 'triangle', 0.1); },   // 星星逐颗弹出
      cheer() { [784, 988, 1175].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sine', 0.09), i * 90)); },
      // 轮子滚动环境音：用持续振荡器，速度调制频率与音量
      rollStart() {
        const a = ensure(); if (!a || ROLL) return;
        try {
          const o = a.createOscillator(), g = a.createGain();
          o.type = 'sawtooth';
          o.frequency.value = 60;
          g.gain.value = 0.0001;
          o.connect(g); g.connect(a.destination);
          o.start();
          ROLL = { o, g };
        } catch (e) {}
      },
      rollSet(speed) {
        if (!ROLL) return;
        const a = ensure(); if (!a) return;
        const v = Math.max(0, Math.min(1, (speed - 1.5) / 10));
        ROLL.o.frequency.setTargetAtTime(50 + v * 130, a.currentTime, 0.08);
        ROLL.g.gain.setTargetAtTime(v * 0.022, a.currentTime, 0.08);
      },
      rollStop() {
        if (!ROLL) return;
        const a = ensure(); if (!a) { ROLL = null; return; }
        ROLL.g.gain.setTargetAtTime(0.0001, a.currentTime, 0.1);
        const r = ROLL; ROLL = null;
        setTimeout(() => { try { r.o.stop(); } catch (e) {} }, 400);
      }""", "音效扩展")

# ROLL 变量声明
rep("    let ac = null;",
    "    let ac = null;\n    let ROLL = null;", "ROLL 变量")

# ---------- 2) 通关：纸花 + 强慢动作 ----------
rep("""        state.slowmo = Math.max(state.slowmo, 0.55);   // 过关瞬间放慢一下""",
"""        state.slowmo = Math.max(state.slowmo, 0.75);   // 过关瞬间放慢（比撞击更久）
        if (state.run.result === 'win') {
          // 纸花：从车上方上抛
          for (let k = 0; k < 26; k++) {
            state.confetti.push({
              x: state.run.car.x + (Math.random() - 0.5) * 3,
              y: state.run.car.y + 2.2 + Math.random() * 1.2,
              vx: (Math.random() - 0.5) * 5,
              vy: 3 + Math.random() * 4.5,
              a: Math.random() * 6.28,
              w: (Math.random() - 0.5) * 12,
              size: 3 + Math.random() * 4,
              life: 1.6 + Math.random() * 0.8,
              color: ['#ffd93d', '#63d97e', '#4a9be0', '#e8816a', '#ffffff'][k % 5]
            });
          }
          SFX.cheer();
        }""", "通关纸花")

# ---------- 3) 状态：confetti ----------
rep("    camState: { x: 0, y: 0, zoom: 1.7 }, shake: 0, flash: 0, vignette: 0, levelSelect: false,",
    "    camState: { x: 0, y: 0, zoom: 1.7 }, shake: 0, flash: 0, vignette: 0, levelSelect: false,\n"
    "    confetti: [], starSfxIdx: -1,", "confetti 状态")

# ---------- 4) 每帧推进纸花 ----------
rep("""      // 碎片：抛物线 + 旋转 + 淡出""",
"""      // 纸花：抛物线 + 摇曳 + 淡出
      if (state.confetti.length) {
        state.confetti.forEach(c2 => {
          c2.vy -= 9 * dt;
          c2.x += c2.vx * dt + Math.sin(performance.now() / 260 + c2.a) * 0.02;
          c2.y += c2.vy * dt;
          c2.a += c2.w * dt;
          c2.life -= dt;
        });
        state.confetti = state.confetti.filter(c2 => c2.life > 0);
      }
      // 碎片：抛物线 + 旋转 + 淡出""", "纸花推进")

# ---------- 5) 绘制纸花 ----------
rep("""  function drawDebris(cam) {""",
"""  function drawConfetti(cam) {
    if (!state.confetti.length) return;
    state.confetti.forEach(c2 => {
      const p = worldToScreen(c2.x, c2.y, cam);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, c2.life / 0.8));
      ctx.translate(p.x, p.y); ctx.rotate(c2.a);
      ctx.fillStyle = c2.color;
      ctx.fillRect(-c2.size / 2, -c2.size / 2, c2.size, c2.size * 0.6);
      ctx.restore();
    });
  }

  function drawDebris(cam) {""", "纸花绘制")

rep("    drawDebris(cam);", "    drawDebris(cam);\n    drawConfetti(cam);", "画纸花")

# ---------- 6) 星星逐颗音效 ----------
rep("    // 星级（三颗小星，间隔 0.3s 依次弹出）",
"""    // 星级音效（每弹出一颗响一次）
    {
      const shown = Math.min(3, Math.floor(Math.max(0, ((state.resultT || 0) - 0.25) * 4 / 1.2)));
      if (shown > (state.starSfxIdx || 0) && win) {
        state.starSfxIdx = shown;
        SFX.star(shown - 1);
      }
    }

    // 星级（三颗小星，间隔 0.3s 依次弹出）""", "星星音效")

# ---------- 7) 轮子滚动环境音 ----------
rep("""      const prevBox = state.run ? state.run.boxesGot : 0;""",
"""      // 轮子滚动环境音（按速度调制）
      if (state.run && state.run.phase === 'run' && !state.paused) {
        const sp3 = Math.hypot(state.run.car.vx, state.run.car.vy);
        SFX.rollStart();
        SFX.rollSet(sp3);
      } else {
        SFX.rollStop();
      }
      const prevBox = state.run ? state.run.boxesGot : 0;""", "滚轮环境音")

p.write_text(t, encoding="utf-8")
print("庆祝演出 + 音效分层完成")

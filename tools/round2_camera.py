"""第 2 轮：镜头语言 + 打击感（"像正常游戏"的另一半）

1) 镜头：弹簧跟随（不再硬贴车）+ 速度拉远（zoom 随速度变化）+ 落地/撞击时轻微震屏
2) 打击感：撞击时白色闪帧（1 帧）+ 屏幕边缘暗角脉动
3) 速度感：高速时画 3 条流动速度线（在镜头边缘）
4) 过关瞬间：镜头轻微推近 + 时间放慢（复用已有 slowmo，但结算时单独给 0.5 秒）
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) 镜头状态 ----------
rep("    helpOpen: false, paused: false, bounce: null, debris: [], slowmo: 0, lastImpact: null,",
    "    helpOpen: false, paused: false, bounce: null, debris: [], slowmo: 0, lastImpact: null,\n"
    "    camState: { x: 0, y: 0, zoom: 1.7 }, shake: 0, flash: 0, vignette: 0,", "镜头状态")

# ---------- 2) 镜头弹簧跟随 + 速度拉远 + 震屏 ----------
rep("    const cam = { x: car.x + 2.0, y: Math.max(car.y, st.terrain.surfaceY(car.x)) + 1.5, zoom: 1.7 };",
"""    // ---- 镜头：弹簧跟随 + 速度拉远 + 撞击震屏 ----
    {
      const spdNow = Math.hypot(car.vx, car.vy);
      const surfY = Math.max(car.y, st.terrain.surfaceY(car.x));
      const targetX = car.x + 2.0 + Math.min(1.6, spdNow * 0.14);   // 越快看得越远
      const targetY = surfY + 1.5;
      const targetZoom = 1.85 - Math.min(0.45, spdNow * 0.035);     // 越快视野越大
      const cs = state.camState;
      const k = 1 - Math.pow(0.001, Math.min(0.1, elapsed));         // 平滑系数（与帧率无关）
      cs.x += (targetX - cs.x) * k;
      cs.y += (targetY - cs.y) * k;
      cs.zoom += (targetZoom - cs.zoom) * k * 0.6;
      // 震屏衰减
      if (state.shake > 0) state.shake = Math.max(0, state.shake - elapsed * 3.2);
      const shk = state.shake;
      var cam = {
        x: cs.x + (Math.random() - 0.5) * shk * 0.55,
        y: cs.y + (Math.random() - 0.5) * shk * 0.55,
        zoom: cs.zoom
      };
    }""", "镜头弹簧")

# ---------- 3) 撞击时触发震屏 + 闪帧 ----------
rep("""              if (evs[i].indexOf('impact') === 0) {
                state.slowmo = 0.35;""",
"""              if (evs[i].indexOf('impact') === 0) {
                state.slowmo = 0.35;
                state.shake = Math.min(1.4, state.shake + 0.85);
                state.flash = 1;
                state.vignette = 1;""", "震屏触发")

# ---------- 4) 闪帧/暗角/速度线 绘制（在 drawRun 末尾） ----------
rep("""    // 终点旗""",
"""    // ---- 速度线（高速时在屏幕边缘流动）----
    {
      const spd2 = Math.hypot(car.vx, car.vy);
      if (spd2 > 4.5) {
        const a0 = Math.min(0.34, (spd2 - 4.5) / 14);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,' + a0.toFixed(3) + ')';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        for (let i = 0; i < 5; i++) {
          const yy = 200 + i * 92 + Math.sin(performance.now() / 240 + i) * 8;
          const len = 60 + Math.sin(performance.now() / 180 + i * 2) * 34;
          const off = (performance.now() / 8 + i * 137) % (DW + 200) - 100;
          ctx.beginPath();
          ctx.moveTo(off, yy);
          ctx.lineTo(off + len, yy);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 终点旗""", "速度线")

rep("""    // ---- 小猪表情判定 ----""",
"""    // ---- 闪帧 + 暗角（撞击反馈）----
    if (state.flash > 0) {
      state.flash = Math.max(0, state.flash - elapsed * 7);
      ctx.fillStyle = 'rgba(255,255,255,' + (state.flash * 0.5).toFixed(3) + ')';
      ctx.fillRect(0, 0, DW, DH);
    }
    if (state.vignette > 0) {
      state.vignette = Math.max(0, state.vignette - elapsed * 1.6);
      const vg = ctx.createRadialGradient(DW / 2, DH / 2, DH * 0.34, DW / 2, DH / 2, DH * 0.92);
      vg.addColorStop(0, 'rgba(180,40,30,0)');
      vg.addColorStop(1, 'rgba(180,40,30,' + (state.vignette * 0.30).toFixed(3) + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, DW, DH);
    }

    // ---- 小猪表情判定 ----""", "闪帧与暗角")

# ---------- 5) 过关时推近 + 时间放慢 ----------
rep("""      if (state.run && state.run.phase === 'resolved' && state.phase === 'run') {
        state.phase = 'resolved';
        state.resultT = 0;""",
"""      if (state.run && state.run.phase === 'resolved' && state.phase === 'run') {
        state.phase = 'resolved';
        state.resultT = 0;
        state.slowmo = Math.max(state.slowmo, 0.55);   // 过关瞬间放慢一下""", "过关放慢")

# ---------- 6) drawRun 需要 elapsed 参数（已有），确认签名 ----------
assert "function drawRun(elapsed) {" in t, "drawRun signature"
p.write_text(t, encoding="utf-8")
print("done")

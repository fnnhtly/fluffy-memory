"""把 drawPartShape 里的猪改成调用统一的 drawPig（带表情），并接入表情判定。

表情判定（在 drawRun 里算一次，存到 state.pigMood）：
- dead   : 掉队（pig_lost / hasPig=false）
- dizzy  : 刚撞（0.6 秒内）
- hurt   : pigHP < 3
- scared : 速度 > 7 m/s 或离地 > 0.6 m
- happy  : 0.8 秒内吃到木箱 / 已通关
- normal : 其余
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# ---------- 1) drawPartShape 里的猪 → 调 drawPig ----------
s0 = t.find("    } else if (def.pig) {\n      /* ---------- 小猪 ---------- */")
s1 = t.find("    } else if (def.wheel) {", s0)
assert s0 > 0 and s1 > s0
new_block = """    } else if (def.pig) {
      // 统一走 drawPig（带表情），这里只是缩小画在框里
      ctx.restore();
      drawPig(cx, cy, size * 0.34, (dir || 0) * Math.PI / 2, def.__mood || 'normal',
        { shake: def.__shake, earSwing: def.__earSwing || 0 });
      return;
"""
t = t[:s0] + new_block + t[s1:]

# ---------- 2) 表情判定 + 传给零件 ----------
anchor = "    // 接触阴影（立体感第二步：物体与地面的关系）"
assert anchor in t
mood_block = '''    // ---- 小猪表情判定 ----
    {
      const car2 = state.run.car;
      const sp2 = Math.hypot(car2.vx, car2.vy);
      const gap = car2.y - st.terrain.surfaceY(car2.x);
      const now2 = state.run.time;
      let mood = 'normal';
      if (!car2.hasPig) mood = 'dead';
      else if ((state.run.lastImpactAt || -9) > now2 - 0.6) mood = 'dizzy';
      else if (state.run.pigHP < 3) mood = 'hurt';
      else if (sp2 > 7 || gap > 0.9) mood = 'scared';
      else if ((state.run.lastBoxAt || -9) > now2 - 0.8) mood = 'happy';
      else if (state.run.result === 'win') mood = 'happy';
      state.pigMood = mood;
      state.pigShake = mood === 'dizzy' || mood === 'hurt';
      state.pigEarSwing = Math.min(1, sp2 / 6);
    }

''' + anchor
t = t.replace(anchor, mood_block, 1)

# ---------- 3) 把表情写进零件的 def（绘制时读）----------
old_draw = """    const ordered = car.parts.slice().sort((a, b) => (a.inner ? 1 : 0) - (b.inner ? 1 : 0));
    ordered.forEach(p => {"""
new_draw = """    const ordered = car.parts.slice().sort((a, b) => (a.inner ? 1 : 0) - (b.inner ? 1 : 0));
    // 把表情状态挂到猪零件的 def 上（def 是共享对象，画完就还原）
    car.parts.forEach(p => {
      if (p.def.pig) {
        p.def.__mood = state.pigMood || 'normal';
        p.def.__shake = state.pigShake;
        p.def.__earSwing = state.pigEarSwing || 0;
      }
    });
    ordered.forEach(p => {"""
assert old_draw in t
t = t.replace(old_draw, new_draw)

p.write_text(t, encoding="utf-8")
print("表情接入完成")

"""修表情判定：
1) gap 用"车体最低点离地"，不是车心（车心常在离地 1.5 m）
2) scared 阈值改成"真腾空"（gap > 1.2 m）或"超高速"（> 9 m/s）
3) 给 dizzy 一个可见窗口：撞击后 0.6 s 内
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

old = """      const sp2 = Math.hypot(car2.vx, car2.vy);
      const gap = car2.y - st.terrain.surfaceY(car2.x);
      const now2 = state.run.time;
      let mood = 'normal';
      if (!car2.hasPig) mood = 'dead';
      else if ((state.run.lastImpactAt || -9) > now2 - 0.6) mood = 'dizzy';
      else if (state.run.pigHP < 3) mood = 'hurt';
      else if (sp2 > 7 || gap > 0.9) mood = 'scared';
      else if ((state.run.lastBoxAt || -9) > now2 - 0.8) mood = 'happy';
      else if (state.run.result === 'win') mood = 'happy';"""
new = """      const sp2 = Math.hypot(car2.vx, car2.vy);
      const ca2 = Math.cos(car2.a), sa2 = Math.sin(car2.a);
      // 车体最低点离地高度（不是车心）
      const lowY = car2.y + (car2.hull ? car2.hull.minY : -0.6) * ca2;
      const gap = Math.max(0, lowY - st.terrain.surfaceY(car2.x));
      const now2 = state.run.time;
      let mood = 'normal';
      if (!car2.hasPig) mood = 'dead';
      else if ((state.run.lastImpactAt || -9) > now2 - 0.7) mood = 'dizzy';
      else if (state.run.pigHP < 3) mood = 'hurt';
      else if (gap > 1.2 || sp2 > 9) mood = 'scared';
      else if ((state.run.lastBoxAt || -9) > now2 - 1.0) mood = 'happy';
      else if (state.run.result === 'win') mood = 'happy';"""
assert old in t
t = t.replace(old, new)
p.write_text(t, encoding="utf-8")
print("表情判定修正")

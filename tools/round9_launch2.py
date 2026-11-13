"""掉出物拖尾（按实际代码匹配）。同时把 drawPig 的受伤参数改成 mood 字符串。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

old = """      if (RAP.PARTS[L.part] && RAP.PARTS[L.part].pig) drawPig(sp.x, sp.y, rr, -L.a, true);
      else drawPartShape(L.part, sp.x, sp.y, rr * 2, 0);
    });"""
new = """      const isPig = RAP.PARTS[L.part] && RAP.PARTS[L.part].pig;
      // 拖尾：按速度反推 3 个残影（看得出"被甩飞"）
      if (Math.hypot(L.vx, L.vy) > 1.2) {
        for (let k = 1; k <= 3; k++) {
          const tp = worldToScreen(L.x - L.vx * 0.045 * k, L.y - L.vy * 0.045 * k, cam);
          ctx.save();
          ctx.globalAlpha = 0.24 - k * 0.06;
          if (isPig) drawPig(tp.x, tp.y, rr * (1 - k * 0.1), -L.a, 'dizzy');
          else drawPartShape(L.part, tp.x, tp.y, rr * 2 * (1 - k * 0.1), 0);
          ctx.restore();
        }
      }
      if (isPig) drawPig(sp.x, sp.y, rr, -L.a, 'dead');
      else drawPartShape(L.part, sp.x, sp.y, rr * 2, 0);
    });"""
assert old in t, "loose render not found"
t = t.replace(old, new)
p.write_text(t, encoding="utf-8")
print("拖尾已加")

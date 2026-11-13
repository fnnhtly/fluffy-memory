"""1) 物理层加里程 odo（轮子自转用）
2) drawPartShape 接受 spin 参数，只对轮子生效
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")

# 里程累计
old = "      car.x += car.vx * h;"
new = ("      car.x += car.vx * h;\n"
       "      car.odo = (car.odo || 0) + Math.abs(car.vx * h);   // 里程（轮子自转用）")
assert old in s
s = s.replace(old, new, 1)

# 初始化
s = s.replace("      pumpCharge: 0, pumpHeld: false, braking: false",
              "      pumpCharge: 0, pumpHeld: false, braking: false, odo: 0")
g.write_text(s, encoding="utf-8")
print("game.js: odo 已加")

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# drawPartShape 签名加 spin
old2 = "  function drawPartShape(part, cx, cy, size, dir, hp) {"
new2 = "  function drawPartShape(part, cx, cy, size, dir, hp, spin) {"
assert old2 in t
t = t.replace(old2, new2, 1)

# 轮子绘制时叠加自转
old3 = "    } else if (def.wheel) {\n      /* ---------- 轮子：外胎 + 辐条 ---------- */"
new3 = ("    } else if (def.wheel) {\n"
        "      /* ---------- 轮子：外胎 + 辐条（唯一允许自转的组件）---------- */\n"
        "      if (spin) ctx.rotate(spin);")
assert old3 in t
t = t.replace(old3, new3, 1)

p.write_text(t, encoding="utf-8")
print("index.html: spin 参数已接")

"""让零件"保持平面连接"：

问题：每个零件绘制尺寸只有 0.86 格（建造 0.88），相邻木框之间留了 5~6px 的缝，
看起来是"几个漂浮的方框"，没有拼成一体的车。

改动：
1. 木框/马达/电池/打气筒 —— 绘制尺寸用满格（1.0），相邻边框严丝合缝
2. 轮子 —— 也用满格（轮径 = 1 米，符合"1 格 = 1 米"）
3. 轮子加"随滚动自转"（唯一允许转动的组件），按行进距离累积角度
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) 建造阶段：满格 ----------
rep("        drawPartShape(cell.part, p.x, p.y, BUILD_PX * 0.88 * sc, cell.dir,\n"
    "          cell.part === 'wood_frame' ? 3 : undefined);",
    "        drawPartShape(cell.part, p.x, p.y, BUILD_PX * sc, cell.dir,\n"
    "          cell.part === 'wood_frame' ? 3 : undefined);",
    "建造零件满格")

# ---------- 2) 行驶阶段：满格 + 轮子自转 ----------
rep("""      const size = PPM * cam.zoom * (p.inner ? 0.6 : 0.86);
      drawPartShape(p.part, s.x, s.y, size, p.dir + (car.a * 180 / Math.PI) / 90, p.hp);""",
"""      const size = PPM * cam.zoom * (p.inner ? 0.62 : 1.0);
      // 只有轮子允许自转：按行驶距离累积角度
      let spin = 0;
      if (p.def.wheel) {
        const r = p.def.radius || 0.5;
        spin = (car.odo || 0) / r;            // 里程 / 半径 = 弧度
      }
      const baseRot = p.def.wheel ? 0 : ((p.dir || 0) + (car.a * 180 / Math.PI) / 90);
      drawPartShape(p.part, s.x, s.y, size, baseRot, p.hp, spin);""",
    "行驶满格 + 轮子自转")

p.write_text(t, encoding="utf-8")
print("done")

"""根因：轮子产生的阻力被 cap 截断后实际很小，调滚阻几乎无效（实测 groundGrip 1→5 滑行距离不变）。

改法：着地时直接给整车一个**水平摩擦减速度**（真·地面摩擦），不再依赖轮子微弱的滚动阻力。
- 参数 groundFriction（m/s²），默认 4.0
- 只在有轮子着地时生效；有马达在驱动力/刹车时减弱，避免把车"钉死"
- 冰面按材质打折（冰 0.08）
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")


def rep(a, b, why):
    global s
    assert a in s, "NOT FOUND: " + why
    s = s.replace(a, b)
    print("  ok:", why)


rep("    groundGrip: 1.0,        // 地面抓地总倍率（轮子滚阻 + 车壳摩擦一起放大）",
    "    groundGrip: 1.0,        // 地面抓地总倍率\n"
    "    groundFriction: 4.0,    // 着地时整车受到的摩擦减速度（m/s²）", "groundFriction 参数")

# 在子步积分之后、位置更新之前，施加整车地面摩擦
rep("""      car.vx += fx * car.inv * h;
      car.vy += fy * car.inv * h;""",
"""      // ---- 整车地面摩擦（真正决定"滑不滑"的量）----
      if (groundWheels > 0) {
        var vh = Math.hypot(car.vx, car.vy);
        if (vh > 0.02) {
          var mat = ter.matAt(car.x);
          var gMul = mat === 'ice' ? 0.08 : (mat === 'stone' ? 0.75 : 1.0);
          var gf = Params.groundFriction * (Params.groundGrip || 1) * gMul;
          // 有动力输出/刹车时不要额外钉住（马达要能推动车、刹车已有自己的减速度）
          var powered = (car.motor && car.energy > 0) ||
            (car.groups || []).some(function (gr) { return gr.on; }) || car.braking;
          if (!powered) {
            var dec = Math.min(vh, gf * h);
            car.vx -= dec * car.vx / vh;
            car.vy -= dec * car.vy / vh;
          }
        }
      }

      car.vx += fx * car.inv * h;
      car.vy += fy * car.inv * h;""", "整车地面摩擦")

g.write_text(s, encoding="utf-8")
print("done")

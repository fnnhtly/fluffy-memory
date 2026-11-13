"""关键手感修正：车下坡后会一直保持俯仰角度，车头蹭地把自己刹停。

原因是"重力作用在质心"不产生回正力矩，而车壳角点的切向摩擦又很硬。
处理：
1) 车壳角点切向摩擦大幅减弱（只在极低速时起作用）；
2) 两个轮子都着地时，给一个"贴地稳定器"：把车体角度往地面坡度上拉。
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")

# 1) 角点摩擦减弱
s = s.replace("          var cap2 = ter.frictionAt(cp.x) * 0.35 * N2;",
              "          var cap2 = ter.frictionAt(cp.x) * 0.10 * N2;")
s = s.replace("          var Ft2 = Math.max(-cap2, Math.min(cap2, -vt2 * 3));",
              "          var Ft2 = Math.max(-cap2, Math.min(cap2, -vt2 * 1.2));")

# 2) 贴地稳定器（在轮子循环里累计着地数）
s = s.replace("      var driveCap = (car.motor && car.energy > 0) ? car.mass * Params.motorAccel : 0;",
              "      var groundWheels = 0;\n      var driveCap = (car.motor && car.energy > 0) ? car.mass * Params.motorAccel : 0;")
s = s.replace("""        if (pen > 0) {
          var slope = ter.surfaceSlope(wp.x);""",
"""        if (pen > 0) {
          groundWheels++;
          var slope = ter.surfaceSlope(wp.x);""")
s = s.replace("""      // 车壳四角（含无轮子时的支撑）""",
"""      // 贴地稳定器：两个轮子都在地上时，把车体角度拉向地面坡度（避免一直俯仰、车头蹭地）
      if (groundWheels >= 2) {
        var targetA = Math.atan(ter.surfaceSlope(car.x));
        car.w += (targetA - car.a) * 6.0 * h;
      }

      // 车壳四角（含无轮子时的支撑）""")

g.write_text(s, encoding="utf-8")
print("贴地稳定器 + 角点摩擦减弱")

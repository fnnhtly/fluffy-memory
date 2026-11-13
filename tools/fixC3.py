"""手感：低速"蠕行"时给一点刹车，别让车在平地上以 0.3 m/s 永远滑下去。
高速完全不受影响（靠惯性的关卡不受牵连）。
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")


def rep(a, b, why):
    global s
    assert a in s, "NOT FOUND: " + why
    s = s.replace(a, b)
    print("  ok:", why)


rep("    rollResist: 0.03,", "    rollResist: 0.03,\n    creepBrake: 2.2,        // 低速蠕行阻尼（1/s），让车能真正停下", "参数")

rep("""      car.vx *= (1 - 0.025 * h);
      car.w *= (1 - 2.6 * h);""",
"""      car.vx *= (1 - 0.025 * h);
      car.w *= (1 - 2.6 * h);
      // 蠕行刹车：慢于 1.5 m/s 且没有动力在输出时，额外阻尼，避免"永远滑一点点"
      var spNow = Math.hypot(car.vx, car.vy);
      var driving = (car.motor && car.energy > 0) ||
        (car.groups || []).some(function (g) { return g.on; });
      if (!driving && spNow < 1.5) {
        var k = 1 - Params.creepBrake * (1 - spNow / 1.5) * h;
        car.vx *= Math.max(0, k);
        car.vy *= Math.max(0, k);
      }""", "蠕行刹车")

g.write_text(s, encoding="utf-8")
print("done")

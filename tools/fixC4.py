"""再提高摩擦（这次动轮子这一侧，而不是只动车壳）：
- 轮子滚动阻力：低速（<3 m/s）0.10 / 高速 0.035（高速保住惯性关卡）
- 轮子抓地倍率 1.0 → 1.2（坡上不打滑）
- 车壳摩擦：低速阈 2.6 → 4.0 m/s，系数 0.36 → 0.5，增益 3.2 → 4.0
- 蠕行刹车：阈 0.9 → 1.5 m/s，强度 1.6 → 2.5
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")


def rep(a, b, why):
    global s
    assert a in s, "NOT FOUND: " + why
    s = s.replace(a, b)
    print("  ok:", why)


rep("    rollResist: 0.03,", "    rollResist: 0.035,   // 高速滚动阻力（低速另有慢速阻力）", "rollResist 高速")
rep("    creepBrake: 1.6,", "    creepBrake: 2.5,", "蠕行刹车 2.5")
rep("    wheelGrip: 1.0,", "    wheelGrip: 1.2,", "抓地 1.2")

# 轮子滚动阻力：按速度分档
rep("          var roll = Params.rollResist * N * Math.sign(vt);",
    "          // 低速时滚动阻力大得多（'木头咬地'），高速保持小阻力（惯性关卡要）\n"
    "          var slowWheel = Math.hypot(car.vx, car.vy) < 3.0;\n"
    "          var rollMu = slowWheel ? 0.10 : Params.rollResist;\n"
    "          var roll = rollMu * N * Math.sign(vt);", "轮子滚阻分档")

# 车壳摩擦加强
rep("          var slowSpd = Math.hypot(car.vx, car.vy) < 2.6;",
    "          var slowSpd = Math.hypot(car.vx, car.vy) < 4.0;", "车壳低速阈 4.0")
rep("(noWheel ? 0.6 : (slowSpd ? 0.36 : 0.10))", "(noWheel ? 0.6 : (slowSpd ? 0.5 : 0.12))", "车壳系数 0.5")
rep("-vt2 * (noWheel ? 4 : (slowSpd ? 3.2 : 1.2))", "-vt2 * (noWheel ? 4.5 : (slowSpd ? 4.0 : 1.4))", "车壳增益 4.0")

# 蠕行刹车阈值
rep("if (!driving && spNow < 0.9) {", "if (!driving && spNow < 1.5) {", "蠕行阈 1.5")
rep("var k = 1 - Params.creepBrake * (1 - spNow / 0.9) * h;",
    "var k = 1 - Params.creepBrake * (1 - spNow / 1.5) * h;", "蠕行公式")

g.write_text(s, encoding="utf-8")
print("done")

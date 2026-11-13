"""摩擦拉到明显"木车在土路"级别（用户第三次说太滑）：
- 轮子滚动阻力 0.06 → 0.16；低速（<3 m/s）0.14 → 0.30
- 轮子抓地 1.2 → 1.4
- 车壳切向摩擦：低速 0.5 → 0.95，高速 0.12 → 0.35，低速阈 4 → 5 m/s，增益 4 → 5
- 蠕行刹车：<1.5 m/s → <2.2 m/s，2.5 → 3.2
- 落地时额外吃掉横向速度（vn>4 时 vx *= 0.85）
- 起始坡再加高 1 m（high_row 3 → 2）补偿摩擦
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")


def rep(a, b, why):
    global s
    assert a in s, "NOT FOUND: " + why
    s = s.replace(a, b)
    print("  ok:", why)


rep("    rollResist: 0.06,", "    rollResist: 0.16,", "rollResist 0.16")
rep("var rollMu = slowWheel ? 0.14 : Params.rollResist;", "var rollMu = slowWheel ? 0.30 : Params.rollResist;", "低速滚阻 0.30")
rep("    wheelGrip: 1.2,", "    wheelGrip: 1.4,", "抓地 1.4")
rep("          var slowSpd = Math.hypot(car.vx, car.vy) < 4.0;",
    "          var slowSpd = Math.hypot(car.vx, car.vy) < 5.0;", "车壳低速阈 5")
rep("(noWheel ? 0.6 : (slowSpd ? 0.5 : 0.12))", "(noWheel ? 0.9 : (slowSpd ? 0.95 : 0.35))", "车壳摩擦 0.95/0.35")
rep("-vt2 * (noWheel ? 4.5 : (slowSpd ? 4.0 : 1.4))", "-vt2 * (noWheel ? 5 : (slowSpd ? 5.0 : 2.0))", "车壳增益 5")
rep("if (!driving && spNow < 1.5) {", "if (!driving && spNow < 2.2) {", "蠕行阈 2.2")
rep("var k = 1 - Params.creepBrake * (1 - spNow / 1.5) * h;",
    "var k = 1 - 3.2 * (1 - spNow / 2.2) * h;", "蠕行强度 3.2")

# 落地吃掉横向速度
rep("""          if (vn < -0.8) {
            if (Math.abs(vn) > 6) {""",
"""          if (vn < -0.8) {
            // 落地/撞击时轮胎咬地：吃掉一部分横向速度（不再是"落地继续滑"）
            if (Math.abs(vn) > 4) {
              car.vx *= 0.85;
              car.w *= 0.7;
            }
            if (Math.abs(vn) > 6) {""", "落地咬地")

g.write_text(s, encoding="utf-8")

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")
t = t.replace("ramp_start(rows, cols, high_row=3, flat_row=FLOOR, ramp_cols=8)",
              "ramp_start(rows, cols, high_row=2, flat_row=FLOOR, ramp_cols=8)")
p.write_text(t, encoding="utf-8")
print("起始坡 high_row 2")

"""摩擦平衡：高速滑行 / 低速刹住。
- 滚阻回 0.03（否则 1-2、1-5 的"靠惯性"关卡过不去）
- 木框摩擦：低速（<3 m/s）用 0.32 快速停住，高速仍用 0.10 保持滑行
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")


def rep(a, b, why):
    global s
    assert a in s, "NOT FOUND: " + why
    s = s.replace(a, b)
    print("  ok:", why)


rep("    rollResist: 0.045,", "    rollResist: 0.03,", "滚阻回 0.03")
rep("          var cap2 = ter.frictionAt(cp.x) * (noWheel ? 0.6 : 0.32) * N2;   // 木框摩擦（之前太滑）",
    "          // 木框摩擦：低速时抓得住（不再像冰面滑走），高速时保持滑行（靠惯性过关的关卡要）\n"
    "          var slowSpd = Math.hypot(car.vx, car.vy) < 3.0;\n"
    "          var cap2 = ter.frictionAt(cp.x) * (noWheel ? 0.6 : (slowSpd ? 0.42 : 0.10)) * N2;",
    "木框摩擦：低速抓地/高速滑行")
rep("          var Ft2 = Math.max(-cap2, Math.min(cap2, -vt2 * (noWheel ? 4 : 2.6)));",
    "          var Ft2 = Math.max(-cap2, Math.min(cap2, -vt2 * (noWheel ? 4 : (slowSpd ? 3.2 : 1.2))));",
    "切向增益按速度")

g.write_text(s, encoding="utf-8")
print("done")

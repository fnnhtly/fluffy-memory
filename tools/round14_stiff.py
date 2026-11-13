"""车体刚性加强：现在是"一个整体"的手感

当前问题：
- 角阻尼 2.6/s 偏软，车在台阶上会晃好几下才稳
- 贴地稳定器 6.0 只拉角度不压角速度，落地后会"摆两下"

改动：
1. 角阻尼 2.6 → 4.5（更快停止摆动）
2. 贴地稳定器：除了拉角度，再**直接压掉垂直方向的角速度**（临界阻尼）
3. 落地时（vn < -4）额外压角速度 0.85 → 0.6（砸实）
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")


def rep(a, b, why):
    global s
    assert a in s, "NOT FOUND: " + why
    s = s.replace(a, b)
    print("  ok:", why)


# 1) 角阻尼加强
rep("      car.w *= (1 - 2.6 * h);", "      car.w *= (1 - 4.5 * h);", "角阻尼 4.5")

# 2) 贴地稳定器：加临界阻尼
rep("""        var targetA = Math.atan(ter.surfaceSlope(car.x));
        car.w += (targetA - car.a) * 6.0 * h;""",
"""        var targetA = Math.atan(ter.surfaceSlope(car.x));
        // 弹簧 + 临界阻尼：拉角度 + 压掉角速度（避免落地后晃两下）
        var err = targetA - car.a;
        car.w += err * 9.0 * h;
        car.w *= (1 - Math.min(0.9, 3.2 * h));""", "稳定器加阻尼")

# 3) 落地压角速度
rep("""          car.w *= 0.85;""", """          car.w *= 0.55;   // 落地砸实：迅速止住翻滚""", "落地压角速度")

g.write_text(s, encoding="utf-8")
print("done")

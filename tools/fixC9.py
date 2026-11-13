"""精确回到最后一次 34/34 全绿的摩擦配置（保留新增的刹车，它是惰性的）。"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")


def rep(a, b, why):
    global s
    assert a in s, "NOT FOUND: " + why
    s = s.replace(a, b)
    print("  ok:", why)


# 蠕行刹车回到 <1.5 m/s、2.5/s
rep("if (!driving && spNow < 2.2) {", "if (!driving && spNow < 1.5) {", "蠕行阈 1.5")
rep("var k = 1 - 3.2 * (1 - spNow / 2.2) * h;", "var k = 1 - Params.creepBrake * (1 - spNow / 1.5) * h;", "蠕行公式")

# 去掉落地额外吃横向速度（那一版没有它）
rep("""            // 落地/撞击时轮胎咬地：吃掉一部分横向速度（不再是"落地继续滑"）
            if (Math.abs(vn) > 4) {
              car.vx *= 0.85;
              car.w *= 0.7;
            }
""", "", "去掉落地吃速度")

g.write_text(s, encoding="utf-8")
print("done")

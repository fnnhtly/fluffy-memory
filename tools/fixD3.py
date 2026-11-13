"""把 groundGrip / chassisGrip 真正加进 DEFAULTS，并让轮子滚阻乘上总倍率。"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")


def rep(a, b, why):
    global s
    assert a in s, "NOT FOUND: " + why
    s = s.replace(a, b)
    print("  ok:", why)


rep("""    brakeDecel: 9.0,        // 刹车减速度 m/s²        // 低速蠕行阻尼（1/s），让车能真正停下""",
"""    brakeDecel: 9.0,        // 刹车减速度 m/s²
    groundGrip: 1.0,        // 地面抓地总倍率（轮子滚阻 + 车壳摩擦一起放大）
    chassisGrip: 0.55,      // 车壳（木框）静摩擦系数""", "DEFAULTS 加两个参数")

# 轮子滚阻乘总倍率
if "Params.groundGrip" not in s.split("var rollMu")[1][:200] if "var rollMu" in s else True:
    rep("          var rollMu = slowWheel ? 0.14 : Params.rollResist;",
        "          var rollMu = (slowWheel ? 0.14 : Params.rollResist) * (Params.groundGrip || 1);",
        "轮子滚阻乘倍率")

g.write_text(s, encoding="utf-8")
print("done")

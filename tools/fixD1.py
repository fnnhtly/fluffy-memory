"""摩擦问题根治（用户第 4 次说低）：

诊断：木框（车壳）**平时根本碰不到地面**——它架在轮子上，离地 0.6 m。
真正让它"滑"的是轮子在自由滚动（切向力只有很小的滚阻）。
所以只调车壳摩擦永远没感觉。

三个改动：
1) 车壳角点改成**真库仑摩擦**（力 = 刚好在这个子步内刹住滑动所需，上限 mu*N）——
   这才叫"抓地"，而不是之前的弹簧阻尼；碰到地面就咬住。
2) 新增 `groundGrip` 总倍率（同时作用于轮子滚阻和车壳摩擦），默认 1.0 保持关卡可解。
3) 提供 4 档预设「滑 / 标准 / 粘 / 极粘」，玩家自己挑。
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")


def rep(a, b, why):
    global s
    assert a in s, "NOT FOUND: " + why
    s = s.replace(a, b)
    print("  ok:", why)


# 1) 总倍率参数
rep("    brakeDecel: 9.0,        // 刹车减速度 m/s²",
    "    brakeDecel: 9.0,        // 刹车减速度 m/s²\n"
    "    groundGrip: 1.0,        // 地面抓地总倍率（轮子滚阻 + 车壳摩擦，一起放大）\n"
    "    chassisGrip: 0.5,       // 车壳（木框）静摩擦系数", "groundGrip/chassisGrip")

# 2) 轮子滚阻乘总倍率
rep("var rollMu = slowWheel ? 0.14 : Params.rollResist;",
    "var rollMu = (slowWheel ? 0.14 : Params.rollResist) * (Params.groundGrip || 1);", "轮子滚阻乘倍率")

# 3) 车壳：真库仑摩擦
old_chassis = """          var noWheel = (car.wheels.length === 0);   // 没轮子时是车壳在拖地，摩擦要大
          var cap2 = ter.frictionAt(cp.x) * (noWheel ? 0.9 : (slowSpd ? 0.5 : 0.12)) * N2;
          var Ft2 = Math.max(-cap2, Math.min(cap2, -vt2 * (noWheel ? 5 : (slowSpd ? 4.0 : 1.4))));"""
new_chassis = """          var noWheel = (car.wheels.length === 0);   // 没轮子时是车壳在拖地
          // 真库仑摩擦：所需力 = 在这个子步内把滑动刹住（m·v/h），再被 μN 截断。
          // 这样"慢慢挪"会被牢牢粘住、"高速蹭地"才会滑出去 —— 这才像木头蹭地。
          var gripMu = (ter.matAt(cp.x) === 'ice')
            ? 0.10
            : ((Params.chassisGrip || 0.5) * (Params.groundGrip || 1) * ter.frictionAt(cp.x) / 0.6);
          if (noWheel) gripMu *= 1.6;
          var cap2 = gripMu * N2;
          var need = Math.abs(vt2) * car.mass / Math.max(1e-5, h);   // 刹住所需力
          var Ft2 = -Math.sign(vt2) * Math.min(need, cap2);"""
rep(old_chassis, new_chassis, "车壳真库仑摩擦")

g.write_text(s, encoding="utf-8")
print("game.js done")

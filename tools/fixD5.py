"""上一步没生效：`groundWheels` 只在轮子真的压进地面（pen>0）时才加，
但车在坡上时轮子经常刚好悬空一点点，所以那段整车摩擦几乎从不执行（实测 gf 0→20 完全没变化）。

改成**按几何判断是否着地**（车底离地表 ≤ 0.25 m 就算贴地），并且车壳角点接触也算。
这样只要车在地上跑，摩擦就一定施加。
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")


def rep(a, b, why):
    global s
    assert a in s, "NOT FOUND: " + why
    s = s.replace(a, b)
    print("  ok:", why)


# 车壳角点接触也算"着地"
rep("""          var N2 = Math.max(0, Math.min(900 * pn - 70 * vn2, 3.0 * car.mass * G));""",
"""          groundWheels = Math.max(groundWheels, 1);   // 车壳蹭地也算贴地
          var N2 = Math.max(0, Math.min(900 * pn - 70 * vn2, 3.0 * car.mass * G));""",
    "车壳接触算着地")

# 整车摩擦：改用几何判断
rep("""      // ---- 整车地面摩擦（真正决定"滑不滑"的量）----
      if (groundWheels > 0) {""",
"""      // ---- 整车地面摩擦（真正决定"滑不滑"的量）----
      // 几何判断是否贴地：车体最低点离地表 ≤ 0.3 m 就算在地上
      var hullBottom = worldOf(car, 0, car.hull.minY).y;
      var groundGap = hullBottom - ter.surfaceY(car.x);
      var onGround = (groundWheels > 0) || (groundGap < 0.3);
      if (onGround) {""", "几何判断贴地")

g.write_text(s, encoding="utf-8")
print("done")

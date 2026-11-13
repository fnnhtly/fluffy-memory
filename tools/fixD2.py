"""车壳改成真库仑摩擦（按实际内容匹配）。"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")

old = """          var noWheel = (car.wheels.length === 0);   // 没轮子时是车壳在拖地，摩擦要大
          // 木框摩擦：低速时抓得住（不再像冰面滑走），高速时保持滑行（靠惯性过关的关卡要）
          var slowSpd = Math.hypot(car.vx, car.vy) < 4.0;
          var cap2 = ter.frictionAt(cp.x) * (noWheel ? 0.9 : (slowSpd ? 0.5 : 0.12)) * N2;
          var Ft2 = Math.max(-cap2, Math.min(cap2, -vt2 * (noWheel ? 5 : (slowSpd ? 4.0 : 1.4))));"""

new = """          var noWheel = (car.wheels.length === 0);   // 没轮子时是车壳在拖地
          // 真库仑摩擦：所需力 = 在这个子步内把滑动刹住（m·v/h），再被 μN 截断。
          // 慢速会被牢牢粘住、高速蹭地才滑出去 —— 这才像木头蹭地。
          var gripMu = (ter.matAt(cp.x) === 'ice')
            ? 0.10
            : ((Params.chassisGrip || 0.5) * (Params.groundGrip || 1) * ter.frictionAt(cp.x) / 0.6);
          if (noWheel) gripMu *= 1.6;
          var cap2 = gripMu * N2;
          var need = Math.abs(vt2) * car.mass / Math.max(1e-5, h);
          var Ft2 = -Math.sign(vt2) * Math.min(need, cap2);"""

assert old in s, "chassis block not found"
s = s.replace(old, new)
g.write_text(s, encoding="utf-8")
print("coulomb friction applied")

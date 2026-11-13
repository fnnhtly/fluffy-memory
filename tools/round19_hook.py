"""在 game.js 里加一个"接触速度统计"钩子（只在有 Params.collectContacts 时工作，
默认关闭，不影响性能），这样能拿到每个子步真实的 vn。
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")

# 1) 轮子接触处埋点
old1 = """          if (vn < -0.8) {
            if (Math.abs(vn) > 6) { log(state, 'impact v=' + Math.abs(vn).toFixed(1) + ' at=' + w.r + ',' + w.c); damageCar(state, Math.abs(vn)); }
          }"""
new1 = """          if (Params.collectContacts) Params.collectContacts.push(+Math.abs(vn).toFixed(2));
          if (vn < -0.8) {
            if (Math.abs(vn) > 6) { log(state, 'impact v=' + Math.abs(vn).toFixed(1) + ' at=' + w.r + ',' + w.c); damageCar(state, Math.abs(vn)); }
          }"""
if old1 in s:
    s = s.replace(old1, new1)
    print("  ok: 轮子埋点")

# 2) 车壳接触处埋点
old2 = "          if (vn2 < -6) { log(state, 'impact v=' + Math.abs(vn2).toFixed(1) + ' at=chassis'); damageCar(state, Math.abs(vn2)); }"
new2 = ("          if (Params.collectContacts) Params.collectContacts.push(+Math.abs(vn2).toFixed(2));\n"
        "          if (vn2 < -6) { log(state, 'impact v=' + Math.abs(vn2).toFixed(1) + ' at=chassis'); damageCar(state, Math.abs(vn2)); }")
if old2 in s:
    s = s.replace(old2, new2)
    print("  ok: 车壳埋点")

g.write_text(s, encoding="utf-8")
print("done")

"""1) 删掉底部装饰带（沙滩 + 海水 + 浪花 + 泡沫）
2) 木框摩擦系数提高：车壳角点的切向摩擦 0.10 → 0.32（无轮时 0.45 → 0.6），增益 1.2 → 2.6
3) 滚动阻力 0.03 → 0.045（轮子不再像在冰上滑）
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")
s0 = t.find("    // 前景：沙滩 + 海水 + 浪花（参考视频底部那一层）")
s1 = t.find("  }\n\n  function drawGrid() {", s0)
assert s0 > 0 and s1 > s0, "sea block not found"
t = t[:s0] + t[s1:]
p.write_text(t, encoding="utf-8")
print("sea/sand band removed")

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")


def rep(a, b, why):
    global s
    assert a in s, "NOT FOUND: " + why
    s = s.replace(a, b)
    print("  ok:", why)


# 车壳（木框）摩擦
rep("          var cap2 = ter.frictionAt(cp.x) * (noWheel ? 0.45 : 0.10) * N2;",
    "          var cap2 = ter.frictionAt(cp.x) * (noWheel ? 0.6 : 0.32) * N2;   // 木框摩擦（之前太滑）",
    "车壳摩擦 0.32")
rep("          var Ft2 = Math.max(-cap2, Math.min(cap2, -vt2 * (noWheel ? 4 : 1.2)));",
    "          var Ft2 = Math.max(-cap2, Math.min(cap2, -vt2 * (noWheel ? 4 : 2.6)));",
    "切向增益 2.6")

# 滚动阻力
rep("    rollResist: 0.03,", "    rollResist: 0.045,", "滚阻 0.045")

g.write_text(s, encoding="utf-8")
print("physics tuned")

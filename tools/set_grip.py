"""按用户指定定标：木框静摩擦 0.75，地面摩擦 0。"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")

pairs = [
    ("    chassisGrip: 0.55,", "    chassisGrip: 0.75,"),
    ("    groundFriction: 0.0,", "    groundFriction: 0.0,"),
]
for a, b in pairs:
    assert a in s, a
    s = s.replace(a, b)
g.write_text(s, encoding="utf-8")
print("chassisGrip=0.75, groundFriction=0")

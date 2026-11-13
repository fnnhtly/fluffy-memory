"""把滚动阻力提到"真实木车"级别（0.12），并把两个靠惯性的关卡起点坡加高。
1) rollResist 0.035 → 0.12；低速档 0.10 → 0.20
2) 1-2 / 1-5 的起始坡：high_row 5 → 3（多 2 m 落差）
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")
s = s.replace("    rollResist: 0.035,", "    rollResist: 0.12,")
s = s.replace("var rollMu = slowWheel ? 0.10 : Params.rollResist;", "var rollMu = slowWheel ? 0.20 : Params.rollResist;")
g.write_text(s, encoding="utf-8")
print("rollResist 0.12 / 低速 0.20")

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")
before = t
# 1-1 / 1-2 / 1-5 的起始坡统一加高
t = t.replace("ramp_start(rows, cols, high_row=5, flat_row=FLOOR, ramp_cols=8)",
              "ramp_start(rows, cols, high_row=3, flat_row=FLOOR, ramp_cols=8)")
p.write_text(t, encoding="utf-8")
print("起始坡加高:", t != before)

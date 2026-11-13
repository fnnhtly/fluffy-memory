"""选关卡片：CH 210 → 250，y 168 → 150（两处：drawLevelSelect 和 levelCardRect）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

n1 = t.count("const CW = 216, CH = 210, GAP = 18;")
t = t.replace("const CW = 216, CH = 210, GAP = 18;", "const CW = 216, CH = 250, GAP = 18;")
print("CH 210→250 处数:", n1)

n2 = t.count("      const y = 168;")
t = t.replace("      const y = 168;", "      const y = 150;")
print("y 168→150 (卡片绘制):", n2)

n3 = t.count("y: 168, w: CW, h: CH };")
t = t.replace("y: 168, w: CW, h: CH };", "y: 150, w: CW, h: CH };")
print("y 168→150 (命中矩形):", n3)

p.write_text(t, encoding="utf-8")
print("done")

"""起点坡改进：先在坡顶给 3 格**平地**再下坡（否则长车在陡坡上出生会被卡住）；
蠕行刹车放宽到 <1.2 m/s / 2.2s。
"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

old = '''def ramp_start(rows, cols, high_row=5, flat_row=FLOOR, ramp_cols=12):
    """col 0..ramp-1 : high_row 起，线性降到 flat_row；之后平地。"""
    for c in range(0, cols):
        if c < ramp_cols:
            k = c / max(1, ramp_cols - 1)
            top = int(round(high_row + (flat_row - high_row) * k))
        else:
            top = flat_row
        for r in range(top, ROWS):
            rows[r][c] = "#"'''

new = '''def ramp_start(rows, cols, high_row=5, flat_row=FLOOR, ramp_cols=12, flat_lead=3):
    """col 0..flat_lead-1 坡顶平地（车能平稳出生）→ 再线性下坡到 flat_row → 之后平地。"""
    for c in range(0, cols):
        if c < flat_lead:
            top = high_row
        elif c < ramp_cols:
            k = (c - flat_lead) / max(1, ramp_cols - flat_lead - 1)
            top = int(round(high_row + (flat_row - high_row) * k))
        else:
            top = flat_row
        for r in range(top, ROWS):
            rows[r][c] = "#"'''

assert old in t
t = t.replace(old, new)
p.write_text(t, encoding="utf-8")
print("ramp_start: 3 格坡顶平地")

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")
s = s.replace("if (!driving && spNow < 2.2) {", "if (!driving && spNow < 1.2) {")
s = s.replace("var k = 1 - 3.2 * (1 - spNow / 2.2) * h;", "var k = 1 - 2.2 * (1 - spNow / 1.2) * h;")
g.write_text(s, encoding="utf-8")
print("蠕行刹车 <1.2 / 2.2")

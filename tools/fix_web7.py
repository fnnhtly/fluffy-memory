"""把建造界面三个按钮竖直对齐到网格中线，并同步自动化脚本的点击坐标。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")
pairs = [
    ("if (name === 'launch') return { x: DW / 2 + 116, y: DH / 2 - 116, w: 64, h: 64 };",
     "if (name === 'launch') return { x: DW / 2 + 116, y: DH / 2 - 20, w: 64, h: 64 };"),
    ("if (name === 'clear') return { x: DW / 2 - 180, y: DH / 2 - 116, w: 64, h: 64 };",
     "if (name === 'clear') return { x: DW / 2 - 180, y: DH / 2 - 20, w: 64, h: 64 };"),
    ("if (name === 'undo') return { x: DW / 2 - 250, y: DH / 2 - 116, w: 56, h: 56 };",
     "if (name === 'undo') return { x: DW / 2 - 250, y: DH / 2 - 16, w: 56, h: 56 };"),
]
for a, b in pairs:
    assert a in t, a
    t = t.replace(a, b)
p.write_text(t, encoding="utf-8")
print("buttons aligned to grid center")

q = pathlib.Path("tools/play_demo2.js")
s = q.read_text(encoding="utf-8")
s = s.replace("await click(788, 372);", "await click(788, 372);")  # 已是新坐标
assert "await click(788, 372);" in s
print("automation click already at (788, 372)")

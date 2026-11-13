"""结算卡片：金币/评级从卡片底部外挪到卡片内部（H-30），并缩小按钮间距冲突。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

old = """      const cy2 = cardY + H + 8;"""
new = """      const cy2 = cardY + H - 34;   // 卡片内部左下，别压到按钮"""
assert old in t
t = t.replace(old, new)
p.write_text(t, encoding="utf-8")
print("coins/grade moved inside card")

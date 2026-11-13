import pathlib
import re

q = pathlib.Path("tools/play_feedback.js")
s = q.read_text(encoding="utf-8")
# 用正则删掉"再点一次 → dir=1"那一行
s2, n = re.subn(r"  await click\(cell\(3, 2\)\.x, cell\(3, 2\)\.y\);.*\n", "", s)
print("removed lines:", n)
q.write_text(s2, encoding="utf-8")

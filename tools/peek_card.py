import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
t = pathlib.Path("prototype/index.html").read_text(encoding="utf-8")
i = t.find("levels.forEach((lv, i) => {")
print(t[i:i + 1500])

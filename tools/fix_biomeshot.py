import pathlib
import re

p = pathlib.Path("tools/shot_biomes.js")
s = p.read_text(encoding="utf-8")
# 用正则替换那一行（避免转义地狱）
new_line = ("    await ev('window.__rap.startLevel(' + i + '); window.__rap.state.welcome = 0; "
            "window.__rap.state.levelSelect = false; window.__rap.state.helpOpen = false;');")
s2, n = re.subn(r"    await ev\(`window\.__rap\.startLevel\(\$\{i\}\)`\);", new_line, s)
print("replaced:", n)
p.write_text(s2, encoding="utf-8")

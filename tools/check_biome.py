import json
import pathlib
import re

s = pathlib.Path("prototype/levels.js").read_text(encoding="utf-8")
found = re.findall(r'"biome":"([a-z]+)"', s)
print("biomes:", found if found else "NONE")

d = json.loads(pathlib.Path("levels/04.json").read_text(encoding="utf-8"))
print("1-4 biome:", d.get("biome", "MISSING"))

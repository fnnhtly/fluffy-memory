"""把 shot-diff 的 WATCH 列表和"预期不变化"的说明补上，避免误报。"""
import pathlib

p = pathlib.Path("tools/shot-diff.mjs")
s = p.read_text(encoding="utf-8")

s = s.replace("""const WATCH = [
  'biome-1-field.png', 'biome-2-canyon.png', 'biome-3-cave.png',
  'biome-4-ice.png', 'biome-5-dusk.png',
  'ls-04-thumb.png', 'rs-01-result.png', 'im-01-impact.png'
];""",
"""// 只放"每次渲染改动都应该变化"的图。
// 注意：ls-04-thumb.png 是选关页，不含车辆零件，改动零件外观时它不会变，
// 所以从 WATCH 移除（避免误报"改动没生效"）。
const WATCH = [
  'biome-1-field.png', 'biome-2-canyon.png', 'biome-3-cave.png',
  'biome-4-ice.png', 'biome-5-dusk.png',
  'rs-01-result.png', 'im-01-impact.png'
];""")
p.write_text(s, encoding="utf-8")
print("WATCH 已修正")

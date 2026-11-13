"""让关卡与用例适配"小猪是内嵌件"：
- 5 张关卡零件箱都加 pig:1
- SPECS 里把小猪放进第 2 个木框（同一格）
- 自检加两条：猪不能放在空地（need_frame）；框里的猪会并入质量
"""
import pathlib
import re

# 1) 关卡零件箱
p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")
for old in ['"partsBox": {"wood_frame": 3, "wood_wheel": 2},',
            '"partsBox": {"wood_frame": 3, "wood_wheel": 2, "pump": 4},',
            '"partsBox": {"wood_frame": 4, "wood_wheel": 2, "motor": 1, "battery": 1},',
            '"partsBox": {"wood_frame": 4, "wood_wheel": 2, "iron_wheel": 2,\n                 "motor": 1, "battery": 1},',
            '"partsBox": {"wood_frame": 4, "wood_wheel": 2, "motor": 1},']:
    if old in t:
        new = old.replace('}', ', "pig": 1}')
        t = t.replace(old, new)
p.write_text(t, encoding="utf-8")
print("关卡零件箱已加 pig:1")

# 2) game.js 的 SPECS
g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")
pairs = [
    ("'1-1': { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]] },",
     "'1-1': { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]] },"),
    ("'1-2': { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pump: [[3, 2]] },",
     "'1-2': { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pump: [[3, 2]], pig: [[4, 2]] },"),
    ("'1-3': { wood_frame: [[4, 1], [4, 2], [4, 3], [4, 4]], wood_wheel: [[5, 1], [5, 4]], motor: [[3, 2]], battery: [[3, 3]] },",
     "'1-3': { wood_frame: [[4, 1], [4, 2], [4, 3], [4, 4]], wood_wheel: [[5, 1], [5, 4]], motor: [[3, 2]], battery: [[3, 3]], pig: [[4, 2]] },"),
    ("'1-4i': { wood_frame: [[4, 1], [4, 2], [4, 3], [4, 4]], iron_wheel: [[5, 1], [5, 4]], motor: [[3, 2]], battery: [[3, 3]] },",
     "'1-4i': { wood_frame: [[4, 1], [4, 2], [4, 3], [4, 4]], iron_wheel: [[5, 1], [5, 4]], motor: [[3, 2]], battery: [[3, 3]], pig: [[4, 2]] },"),
    ("'1-4w': { wood_frame: [[4, 1], [4, 2], [4, 3], [4, 4]], wood_wheel: [[5, 1], [5, 4]], motor: [[3, 2]], battery: [[3, 3]] },",
     "'1-4w': { wood_frame: [[4, 1], [4, 2], [4, 3], [4, 4]], wood_wheel: [[5, 1], [5, 4]], motor: [[3, 2]], battery: [[3, 3]], pig: [[4, 2]] },"),
    ("'1-5m': { wood_frame: [[4, 0], [4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 0], [5, 3]], motor: [[3, 1]] },",
     "'1-5m': { wood_frame: [[4, 0], [4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 0], [5, 3]], motor: [[3, 1]], pig: [[4, 1]] },"),
    ("'1-5n': { wood_frame: [[4, 0], [4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 0], [5, 3]] }",
     "'1-5n': { wood_frame: [[4, 0], [4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 0], [5, 3]], pig: [[4, 1]] }"),
]
n = 0
for a, b in pairs:
    if a in s:
        s = s.replace(a, b)
        n += 1
g.write_text(s, encoding="utf-8")
print(f"SPECS 已更新 {n}/{len(pairs)} 条")

# 3) 自检加中空木框的两条
c = pathlib.Path("prototype/check_html_logic.js")
k = c.read_text(encoding="utf-8")
k = k.replace("""// ---------------- 交互键上限 ----------------""",
"""// ---------------- 中空木框 + 内嵌小猪 ----------------
{
  RAP.resetParams();
  const lv = byId['1-1'];
  const b = RAP.newBuild();
  const r1 = RAP.tryPlace(lv, b, 'pig', 4, 0);
  ok('小猪不能放在空地（必须先有木框）', !r1.ok && r1.reason === 'need_frame', JSON.stringify(r1));
  RAP.tryPlace(lv, b, 'wood_frame', 4, 2);
  const r2 = RAP.tryPlace(lv, b, 'pig', 4, 2);
  ok('小猪可以放进中空木框里（同一格内槽）', r2.ok, JSON.stringify(r2));
  const r3 = RAP.tryPlace(lv, b, 'pig', 4, 2);
  ok('一个框只能塞一只猪', !r3.ok && r3.reason === 'occupied', JSON.stringify(r3));
  const car = RAP.buildVehicle(lv, b);
  ok('框里的猪计入车体质量与 hasPig', car.hasPig === true && car.mass > 1.2 + 1.5 - 0.01,
    'mass=' + car.mass.toFixed(2) + ' hasPig=' + car.hasPig);
}

// ---------------- 交互键上限 ----------------""")
c.write_text(k, encoding="utf-8")
print("自检已加 4 条中空木框断言")

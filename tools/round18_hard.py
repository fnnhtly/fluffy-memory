"""给地形加"硬台阶"能力：整列跳过平滑，形成真的垂直墙面。

关卡数据里可以声明 `hardCols: [14, 15]`，这些列的高度不参与平滑。
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")

# 1) 在平滑循环里跳过 hardCols
old_smooth_start = """    var smoothH = rawH.slice();
    var kernel = [1, 2, 3, 2, 1];"""
new_smooth_start = """    var smoothH = rawH.slice();
    // 硬台阶：这些列不做平滑，保持垂直落差（用于制造"会撞"的地形）
    var hardSet = {};
    (level.hardCols || []).forEach(function (c) { hardSet[c] = true; });
    var kernel = [1, 2, 3, 2, 1];"""
assert old_smooth_start in s, "smooth start not found"
s = s.replace(old_smooth_start, new_smooth_start, 1)

# 2) 平滑后把硬列还原
idx = s.find("    var heightField")
if idx < 0:
    # 找不到就直接在 smoothH 算完后还原：找 return 之前的赋值
    idx = s.find("      surfaceY", 0)
# 用更稳的方式：在所有平滑 pass 结束后插还原
anchor = "    return {"
assert anchor in s
restore = """    // 硬台阶列：还原为原始高度（不平滑）
    Object.keys(hardSet).forEach(function (k) {
      var c = Number(k);
      if (c >= 0 && c < cols) smoothH[c] = rawH[c];
    });

"""
s = s.replace(anchor, restore + anchor, 1)

g.write_text(s, encoding="utf-8")
print("game.js: hardCols 支持已加")

"""车变重之后 1-2 的 1 米台阶会把车掀翻（轮子离质心 1.5 m，撞击时力矩太大）。

处理：轮子接触力矩打 5 折 + 角阻尼 1.4 → 2.6（游戏化处理，避免"磕一下就翻"）。
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")

s = s.replace("          tq += rx * (ny * N + ty * Ft) - ry * (nx * N + tx * Ft);",
              "          tq += 0.5 * (rx * (ny * N + ty * Ft) - ry * (nx * N + tx * Ft));  // 轮子力矩打 5 折，防止磕台阶就翻")
s = s.replace("      car.w *= (1 - 1.4 * h);", "      car.w *= (1 - 2.6 * h);")

g.write_text(s, encoding="utf-8")
print("轮子力矩 0.5x + 角阻尼 2.6")

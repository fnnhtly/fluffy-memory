"""文档与用例：方向件（箭头 + 切换方向）。"""
import pathlib

# ---------- GDD ----------
p = pathlib.Path("docs/gdd.md")
t = p.read_text(encoding="utf-8")
t = t.replace(
    "   **中空木框**：木框本身是一圈边框，中间是空的 —— 小猪要拖进**已有木框的那一格**（占该格内槽），\n"
    "   放空地会被拒绝（`need_frame`）。内槽只放得下一件，且计入质量与重心。",
    "   **中空木框**：木框本身是一圈边框，中间是空的 —— 小猪要拖进**已有木框的那一格**（占该格内槽），\n"
    "   放空地会被拒绝（`need_frame`）。内槽只放得下一件，且计入质量与重心。\n"
    "3. **方向件（喷气/推进）**：带推进方向的零件（首批：打气筒；后续：风扇/螺旋桨/可乐瓶/火箭）\n"
    "   在组装界面会用**金色箭头**画在格心，箭头就是它喷气的方向；切换方向有三种等价操作：\n"
    "   右键点该格 / 按 `R`（光标所在格）/ **再点一次已放的同一零件**（`tryPlace` 返回 `rotated`）。\n"
    "   也有显式按钮「↻ 换方向」。物理上冲量沿**零件朝向 × 车体当前旋转**施加，不是固定朝车头。")

t = t.replace("| 打气筒 `pump` | 动力（手动交互） | 0.8 | 按住蓄力、松开放出瞬时扭矩，上限 1 次/秒 | 1-2 |",
              "| 打气筒 `pump` | 动力（手动交互，**方向件**） | 0.8 | 按住蓄力、松开放出瞬时推力，**方向由组装期朝向决定**；上限 1 次/秒 | 1-2 |")
p.write_text(t, encoding="utf-8")
print("gdd.md: 方向件规则")

# ---------- 美术方案：箭头规范 ----------
a = pathlib.Path("docs/art-bible.md")
b = a.read_text(encoding="utf-8")
b = b.replace("| 马达 | rect（红）+ 小方块出轴 | 持续动力 |",
              "| 马达 | rect（红）+ 小方块出轴 | 持续动力 |\n"
              "| **方向件（打气筒/风扇/螺旋桨…）** | 零件本体 + **金色箭头**（长度 = 推力大小感） | 喷气方向；悬停时箭头加粗加亮成 `#FFF3C4`，行驶中淡化到 70% 透明度 |")
a.write_text(b, encoding="utf-8")
print("art-bible: 箭头规范")

# ---------- 用例：方向切换 ----------
c = pathlib.Path("tools/make_cases.py")
s = c.read_text(encoding="utf-8")
s = s.replace("# T16 发射守卫",
"""# T17 方向件：再点一次已放的打气筒 → 朝向 0→1，发射后按交互键
ev = [enter(0.3, 2)]
t = 0.6
t = place(t, ev, "wood_frame", L2_FRAMES)
t = place(t, ev, "wood_wheel", L2_WHEELS)
t = place(t, ev, "pig", [(4, 2)])
t = place(t, ev, "pump", [(3, 2)])
ev.append(click(t, "Tray_pump")); t += 0.3
ev.append(click(t, "Cell_3_2")); t += 0.3          # 再点一次 = 换方向（0 → 1）
ev.append(click(t, "LaunchButton")); t += 0.5
ev.append(click(t, "InteractButton_1")); t += 0.2
files["t17-dir-rotate.json"] = case("t17-dir-rotate", ev, [
    log(1.6, "place pump dir=0"),
    log(2.2, "place pump dir=1"),
    log(2.8, "launch"),
])

# T16 发射守卫""")
c.write_text(s, encoding="utf-8")
print("make_cases.py: t17 方向切换")

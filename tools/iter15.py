"""把"木框中空 + 角色内嵌"写进文档与用例。"""
import pathlib

# ---------- 1) GDD ----------
p = pathlib.Path("docs/gdd.md")
t = p.read_text(encoding="utf-8")

t = t.replace(
    "| 木框 `wood_frame` | 结构 | 1.2 | 唯一结构件，四面可挂载，耐久 2 | 1-1 |",
    "| 木框 `wood_frame` | 结构 | 1.2 | **中空结构件**：四面可挂载，中间能塞下一个小猪；耐久 2 | 1-1 |")
t = t.replace(
    "| 打气筒 `pump` | 动力（手动交互） | 0.8 | 按住蓄力、松开放出瞬时扭矩，上限 1 次/秒 | 1-2 |",
    "| 打气筒 `pump` | 动力（手动交互） | 0.8 | 按住蓄力、松开放出瞬时扭矩，上限 1 次/秒 | 1-2 |\n"
    "| 小猪 `pig` | 内嵌件 | 1.5 | **只能放进中空木框**（同格内槽），是胜负判定对象；框碎了才裸**露** | 1-1 |")

t = t.replace(
    "2. **放置与朝向**：拖拽放置、靠近吸附；只能挂在结构件（木框）上；零件可旋转 4 向。",
    "2. **放置与朝向**：拖拽放置、靠近吸附；零件挂在木框上，零件可旋转 4 向。\n"
    "   **中空木框**：木框本身是一圈边框，中间是空的——小猪要拖进**已有木框的那一格**（占该格内槽），\n"
    "   放空地会被拒绝（`need_frame`）。内槽只放得下一件，且计入质量与重心。")

t = t.replace("| 8 | 1-1 无 ★★★ | 保持（最多 2 星） | `stars = 1 + 木箱 + 挑战`，没有挑战就只有 2 星 |",
              "| 8 | 1-1 无 ★★★ | 保持（最多 2 星） | `stars = 1 + 木箱 + 挑战`，没有挑战就只有 2 星 |\n"
              "| 9 | 小猪是"自动挂在车上"的角色 | **小猪变成可放置的内嵌件**（用户要求"结构中空、角色放进去"） | "
              "视觉与玩法都更像参考；同时带来两条新规则：放空地拒绝（need_frame）、框碎了猪才裸露 |")
p.write_text(t, encoding="utf-8")
print("gdd.md 更新")

# ---------- 2) 用例：小猪改成放进木框 ----------
c = pathlib.Path("tools/make_cases.py")
s = c.read_text(encoding="utf-8")
s = s.replace('{ "t": 2.5, "kind": "click", "payload": { "name": "Tray_pig" } },\n  { "t": 2.75, "kind": "click", "payload": { "name": "Cell_1_4" } },',
              '{ "t": 2.5, "kind": "click", "payload": { "name": "Tray_pig" } },\n  { "t": 2.75, "kind": "click", "payload": { "name": "Cell_4_2" } },')
s = s.replace("""# 1-1 标准解：木框 ×3（第 4 行 c1..c3）+ 木轮 ×2（第 5 行 c1、c3）""",
              """# 1-1 标准解：木框 ×3（第 4 行 c1..c3）+ 木轮 ×2（第 5 行 c1、c3）+ 小猪塞进中间木框（4,2）""")
s = s.replace('L2_PUMP = [(3, 2)]', 'L2_PUMP = [(3, 2)]\nPIG_CELL = (4, 2)')
c.write_text(s, encoding="utf-8")
print("make_cases.py 更新")

# ---------- 3) 美术方案补充 ----------
a = pathlib.Path("docs/art-bible.md")
b = a.read_text(encoding="utf-8")
b = b.replace("| 木框 | rect + 木纹横线 + 左右两个\"挂点夹子\" | 唯一可挂载的结构件 |",
              "| 木框 | **四条边围成中空方框**（内壁描阴影）+ 对角两名挂点铆钉 | 唯一可挂载的结构件；**中间是空的，能看见后面的景**，3D 感来源之一 |")
b = b.replace("| 猪 | circle + 双耳 + 鼻子；受伤 → × 眼 | 被保护对象，必须有表情 |",
              "| 猪 | circle + 双耳 + 鼻子；受伤 → × 眼 | **放进木框里**（0.62 倍），是玩家要保护的对象 |")
a.write_text(b, encoding="utf-8")
print("art-bible 更新")

# ---------- 4) 制作计划 ----------
q = pathlib.Path("docs/production-plan.md")
r = q.read_text(encoding="utf-8")
r = r.replace("- 阻塞项：`docs/art-bible.md` 第八节三个确认项",
              "- **2026-04-19 追加设计变更**：用户要求「结构中空，让角色可以被放进去」→ 已实现：\n"
              "  木框中空（四条边）、小猪变成内嵌件（只能放进已有木框的格子，`need_frame`）、框碎后猪裸露；\n"
              "  同时修掉三个连带问题：车变重后磕台阶翻车（轮子力矩减半+角阻尼）、下坡后一直俯仰导致车头蹭地（贴地稳定器）、\n"
              "  台阶磕碰三连扣血（猪受伤阈值 10 + 0.6s 冷却）。数值校核 22/22 PASS。\n"
              "- 阻塞项：`docs/art-bible.md` 第八节三个确认项")
q.write_text(r, encoding="utf-8")
print("production-plan 更新")

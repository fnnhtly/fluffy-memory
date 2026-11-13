import pathlib

q = pathlib.Path("records/playtest.md")
r = q.read_text(encoding="utf-8")
add = """## 2026-04-19 · 用户在试玩里定标（runtime=html）

用户在 T 面板里试出的手感基线（**以此为准，写进千星实现**）：

| 参数 | 值 | 含义 |
|---|---|---|
| `chassisGrip`（木框静摩擦系数） | **0.75** | 静摩擦角 = atan(0.75) ≈ **36.9°** |
| `groundFriction`（整车地面摩擦） | **0** | 关掉额外的整体摩擦，只靠接触摩擦 |

推论（对关卡设计很重要）：
- 坡角 < 36.9° 时，木框在坡上**能停住**（不会自己溜）；
- 坡角 > 36.9° 才会自己下滑 —— 所以"靠缓坡溜"必须做成 **> 40°** 的陡坡，
  或者干脆改用马达/打气筒驱动，不再依赖溜坡。

回归：34/34 全绿，1-1、1-2 正常通关。

"""
marker = "## 已知弱点（如实记录）"
assert marker in r
r = r.replace(marker, add + marker)
q.write_text(r, encoding="utf-8")
print("playtest 已记录基线")

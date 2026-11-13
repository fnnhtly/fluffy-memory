import pathlib

q = pathlib.Path("records/playtest.md")
r = q.read_text(encoding="utf-8")
add = """## 2026-11-13 · 第 1 轮：表情演出 + 地貌配色（runtime=html，执行者：Agent）

### 小猪表情系统（参考视频的主要笑点）

`drawPig(cx, cy, r, angle, mood, extra)` 支持 6 种表情，由运行状态驱动：

| 表情 | 触发条件 | 视觉 |
|---|---|---|
| normal | 默认 | 圆眼 + **周期性眨眼** + 眼睛高光 |
| happy | 1 秒内吃到木箱 / 已通关 | **^ ^ 眼** + 张嘴笑 |
| scared | 车体最低点离地 > 1.2 m，或速度 > 9 m/s | **大眼小瞳孔** + 竖起的眉毛 |
| hurt | pigHP < 3 | **> < 眼** + 抖动 |
| dizzy | 撞击后 0.7 秒内 | **> < 眼 + 头顶三颗旋转星星** |
| dead | 掉队（小猪已甩出） | **× 眼** |

附加演出：耳朵随速度摆动、受击抖动、头顶高光、腮红。

### 地貌配色

按关卡材质自动切换（`PAL`）：
- **原野**（mud 为主）：亮绿草皮 + 深青灰石头
- **洞窟**（stone 占比 > 35%）：暗绿草 + 近乎黑的石头（参考视频的洞窟关观感）
- **冰原**（ice 占比 > 20%）：蓝白石头 + 冰蓝草皮 + 冰面高光条

### 修掉的问题
表情一开始一直卡在 `scared`：判定用了"车心离地高度"，而车心常在离地 1.5 m。
改成**车体最低点**（`car.y + hull.minY` 按角度旋转）后正常。

回归：34/34 + 橡皮/说明/刹车/表情 四个脚本 0 异常。

"""
marker = "## 已知弱点（如实记录）"
assert marker in r
r = r.replace(marker, add + marker)
q.write_text(r, encoding="utf-8")
print("记录已补")

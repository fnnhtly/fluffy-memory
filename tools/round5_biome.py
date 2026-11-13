"""给关卡加一个纯视觉字段 `biome`，与物理材质（materials）彻底解耦。

为什么：`materials` 影响摩擦系数（mud 0.6 / stone 0.45 / ice 0.05），
改它会破坏 34/34 的关卡可解性。而"看起来像洞窟/峡谷/海滩"只是美术，
不该受物理约束 —— 所以单独开一个 biome 字段。

1-1 field（原野）/ 1-2 canyon（峡谷）/ 1-3 cave（洞窟）/ 1-4 ice（冰原）/ 1-5 dusk（黄昏裂谷）
"""
import pathlib

p = pathlib.Path("tools/make_levels.py")
t = p.read_text(encoding="utf-8")

# 给 5 个关卡各插一个 biome 字段（紧跟 levelId 行）
pairs = [
    ('"levelId": "1-1", "name": "放个轮子", "chapter": 1,',
     '"levelId": "1-1", "name": "放个轮子", "chapter": 1, "biome": "field",'),
    ('"levelId": "1-2", "name": "按一下", "chapter": 1,',
     '"levelId": "1-2", "name": "按一下", "chapter": 1, "biome": "canyon",'),
    ('"levelId": "1-3", "name": "电池够不够", "chapter": 1,',
     '"levelId": "1-3", "name": "电池够不够", "chapter": 1, "biome": "cave",'),
    ('"levelId": "1-4", "name": "冰面", "chapter": 1,',
     '"levelId": "1-4", "name": "冰面", "chapter": 1, "biome": "ice",'),
    ('"levelId": "1-5", "name": "第一道坎", "chapter": 1,',
     '"levelId": "1-5", "name": "第一道坎", "chapter": 1, "biome": "dusk",'),
]
for a, b in pairs:
    assert a in t, a
    t = t.replace(a, b)
p.write_text(t, encoding="utf-8")
print("biome 字段已加")

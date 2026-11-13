"""生成"更原神"方向的静态美术验证存档（千星里直接看效果）。

图层（从后到前）：
L1 天空：官方底纹 107231（星空蓝紫）铺满，再用深青 rect 压暗下半
L2 远景丛林：圆图元 100002 染色（深青绿）
L3 地形：三段色带（暗石 / 石 / 上沿高光）+ 草皮亮带 + 描边，按坡道阶梯排
L4 前景：沙滩 + 海水三段 + 浪花亮线
UI：官方图标（对勾 101102 / 垃圾桶 101038 / 木箱 105221 / 齿轮 105180 / 星 104002）+ 面板底 107208
"""
import copy
import json
import pathlib

BASE = pathlib.Path("../tumble-piggy/tumble-piggy.save.json")
OUT = pathlib.Path("probe")
OUT.mkdir(exist_ok=True)

DW, DH = 1280, 720


def rect_node(idx, name, x, y, w, h, color, image_id=100001):
    node = copy.deepcopy(TEMPLATE)
    node["id"] = f"m{idx}"
    node["guid"] = 1073760000 + idx
    node["name"] = name
    node["active"] = True
    node["visible"] = True
    node["imageId"] = image_id
    node["imageColor"] = color
    for plat in node["transformByPlatform"].values():
        plat["size"] = {"x": w, "y": h}
        plat["offset"] = {"x": x + w / 2 - DW / 2, "y": DH / 2 - (y + h / 2)}
    return node


save = json.loads(BASE.read_text(encoding="utf-8"))
world = save["assets"]["server"]["root"]["children"][0]
TEMPLATE = world["children"][0]           # image 节点
world["children"] = []

nodes = []
i = 0


def add(name, x, y, w, h, color, image_id=100001):
    global i
    nodes.append(rect_node(i, name, x, y, w, h, color, image_id))
    i += 1


# ---------- L1 天空 ----------
add("SkyBase", -8, -8, DW + 16, DH + 16, 0xFFFFFFFF, 107231)          # 官方底纹
add("SkyVeil", -8, 300, DW + 16, DH - 300 + 8, 0x88A8E0E8)            # 青绿雾罩（原神感）

# ---------- L2 远景丛林（圆冠） ----------
jungle = [(-40, 380, 200), (110, 366, 180), (250, 386, 210), (400, 360, 190),
          (540, 380, 205), (690, 366, 185), (830, 384, 200), (980, 362, 190),
          (1120, 380, 200)]
for k, (cx, cy, r) in enumerate(jungle):
    add(f"Jungle{k}", cx - r / 2, cy - r / 2, r, r, 0xCC2F6E55, 100002)
add("JungleBand", -8, 392, DW + 16, 220, 0xDD2F6E55)

# ---------- L3 地形（阶梯坡道 + 三段色带 + 草皮 + 描边） ----------
steps = [(0, 470, 240), (240, 500, 220), (460, 536, 200), (660, 560, 220),
         (880, 574, 200), (1080, 580, 220)]
for k, (x, top, w) in enumerate(steps):
    bottom = DH + 20
    # 石墙主体（上亮下暗）
    add(f"RockTop{k}", x, top + 18, w + 2, bottom - top, 0xFF7E8A98)
    add(f"RockHi{k}", x, top + 18, w + 2, 16, 0xFF9AA6B4)             # 上沿高光
    add(f"RockLo{k}", x, top + 120, w + 2, bottom - top - 120, 0xFF5A6572)  # 下沿压暗
    # 草皮亮带 + 阴影 + 描边
    add(f"Grass{k}", x - 1, top, w + 4, 12, 0xFF7FD24A)
    add(f"GrassShade{k}", x - 1, top + 12, w + 4, 5, 0xFF2F6B33)
    add(f"Edge{k}", x - 1, top + 17, w + 4, 4, 0xFF1D2A22)

# ---------- L4 前景：沙滩 + 海 + 浪花 ----------
add("Sand", -8, 626, DW + 16, 22, 0xFFE0D49A)
add("SeaHi", -8, 648, DW + 16, 26, 0xFF3FB6D2)
add("SeaMid", -8, 674, DW + 16, 26, 0xFF2F9FC0)
add("SeaLo", -8, 700, DW + 16, 28, 0xFF2288AD)
add("Foam", -8, 646, DW + 16, 6, 0xFFF2FBF4)
for k in range(18):
    x = k * 74 + 10
    add(f"Bubble{k}", x, 656 + (k % 3) * 8, 8, 8, 0xAAFFFFFF, 100002)

# ---------- UI（官方图标） ----------
add("PanelBuild", 420, 150, 440, 330, 0xD91B2A33, 107208)             # 建造面板底
add("CellRow0", 432, 168, 416, 44, 0x66C8E6E0)
add("CellRow1", 432, 218, 416, 44, 0x66C8E6E0)
add("CellRow2", 432, 268, 416, 44, 0x66C8E6E0)
add("CellRow3", 432, 318, 416, 44, 0x66C8E6E0)
add("IconLaunch", 890, 250, 72, 72, 0xFFFFFFFF, 101102)               # 对勾
add("IconClear", 320, 250, 72, 72, 0xFFFFFFFF, 101038)                # 垃圾桶
add("IconBox", 470, 470, 40, 40, 0xFFFFFFFF, 105221)                  # 木箱
add("IconGear", 560, 480, 44, 44, 0xFFFFFFFF, 105180)                 # 齿轮
add("IconStar", 640, 478, 40, 40, 0xFFFFE066, 104002)                 # 星
add("TrayBar", -8, 494, DW + 16, 96, 0xE6142028)
for k in range(6):
    add(f"Slot{k}", 460 + k * 64, 516, 52, 52, 0xE62A3A44)

world["children"] = nodes
save["canvasId"] = "mobile-16-9"
path = OUT / "art-mock-genshin.save.json"
path.write_text(json.dumps(save, ensure_ascii=False), encoding="utf-8")
print("written", path, "nodes:", len(nodes))

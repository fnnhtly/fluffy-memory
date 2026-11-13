"""按 v1.0 附录 B 的 schema 生成垂直切片 5 张关卡：levels/01.json .. 05.json

地图符号：# 实体 / . 空气 / S 起点 / E 终点 / B 木箱 / / 斜坡 / = 冰面 / ~ 熔岩
坐标：原点左上，col 向右、row 向下，1 格 = 1 m = 32 px。
生成后会做自洽校验（S/E/B 位置、地板连续性、建造区尺寸）。
"""
import json
import pathlib

OUT = pathlib.Path("levels")
OUT.mkdir(exist_ok=True)

FLOOR = 8          # 该行及以下为实体
ROWS = 14


def blank(cols, floor=FLOOR, surface="."):
    """生成 cols x ROWS 的空图，floor 行及以下填 #，地面上方为 surface。"""
    rows = []
    for r in range(ROWS):
        if r < floor:
            rows.append([surface if r == floor - 1 else "."] * cols)
        else:
            rows.append(["#"] * cols)
    return rows


def put(rows, col, row, ch):
    rows[row][col] = ch


def fill(rows, col0, col1, row, ch):
    for c in range(col0, col1 + 1):
        rows[row][c] = ch


def as_strings(rows):
    return ["".join(r) for r in rows]


levels = []

# ---------- 公共：从第 0 列就开始的下坡开局 ----------
def ramp_start(rows, cols, high_row=5, flat_row=FLOOR, ramp_cols=12):
    """col 0..ramp-1 从 high_row 缓降到 flat_row，之后平地。"""
    for c in range(0, cols):
        if c < ramp_cols:
            k = c / max(1, ramp_cols - 1)
            top = int(round(high_row + (flat_row - high_row) * k))
        else:
            top = flat_row
        for r in range(top, ROWS):
            rows[r][c] = "#"


# ---------------- 1-1 放个轮子 ----------------
cols = 40
rows = blank(cols)
ramp_start(rows, cols, high_row=5, flat_row=FLOOR, ramp_cols=12)
put(rows, 1, 4, "S")                  # 出生在坡顶（地表 row 5）
put(rows, 25, 7, "E")
put(rows, 22, 7, "B")
levels.append({
    "levelId": "1-1", "name": "放个轮子", "chapter": 1, "biome": "field",
        "grid": {"cols": cols, "rows": ROWS, "cell": 1.0, "px": 32},
    "buildArea": {"cols": 6, "rows": 8},
    "start": {"col": 1, "row": 4}, "goal": {"col": 25, "row": 7},
    "physics": {"gravity": 16.0, "stepHz": 60, "subSteps": 4,
                "friction": {"mud": 0.6, "stone": 0.45, "ice": 0.05}},
    "partsBox": {"wood_frame": 3, "wood_wheel": 2, "pig": 1},
    "mapRows": as_strings(rows),
    "materials": [{"surfaceRow": FLOOR, "cols": [0, cols - 1], "type": "mud"}],
    "boxes": [{"col": 22, "row": 7}],
    "challenge": {"type": "none"},
    "timeLimit": 120,
})

# ---------------- 1-2 按一下 ----------------
cols = 40
rows = blank(cols)
ramp_start(rows, cols, high_row=5, flat_row=FLOOR, ramp_cols=8)
for c in range(9, cols):
    top = 7 if c >= 11 else 8 - (c - 8) // 2
    for r in range(top, ROWS):
        rows[r][c] = "#"                # col 9..10 抬 1 m，之后平地
put(rows, 1, 4, "S")
put(rows, 12, 7, "E")
put(rows, 8, 6, "B")
levels.append({
    "levelId": "1-2", "name": "按一下", "chapter": 1, "biome": "canyon",
    "grid": {"cols": cols, "rows": ROWS, "cell": 1.0, "px": 32},
    "buildArea": {"cols": 6, "rows": 8},
    "start": {"col": 1, "row": 4}, "goal": {"col": 12, "row": 7},
    "physics": {"gravity": 16.0, "stepHz": 60, "subSteps": 4,
                "friction": {"mud": 0.6, "stone": 0.45, "ice": 0.05}},
    "partsBox": {"wood_frame": 3, "wood_wheel": 2, "pump": 4, "pig": 1},
    "mapRows": as_strings(rows),
    "materials": [{"surfaceRow": FLOOR, "cols": [0, 19], "type": "mud"},
                  {"surfaceRow": 7, "cols": [20, cols - 1], "type": "stone"}],
    "boxes": [{"col": 8, "row": 6}],
    "challenge": {"type": "pumpPress", "max": 0},
    "timeLimit": 120,
})

# ---------------- 1-3 电池够不够 ----------------
cols = 66
rows = blank(cols)
# 终点前 3 m 上坡（1:3 → 约 1 m 高，用两级斜坡近似）
for c in range(62, cols):
    top = 7 if c >= 65 else 8 - (c - 61) // 3
    for r in range(top, ROWS):
        rows[r][c] = "#"                # 终点前 1:3 上坡
put(rows, 1, 4, "S")
put(rows, 64, 5, "E")
put(rows, 25, 7, "B")
put(rows, 45, 7, "B")
levels.append({
    "levelId": "1-3", "name": "电池够不够", "chapter": 1, "biome": "cave",
    "grid": {"cols": cols, "rows": ROWS, "cell": 1.0, "px": 32},
    "buildArea": {"cols": 6, "rows": 8},
    "start": {"col": 3, "row": 7}, "goal": {"col": 64, "row": 5},
    "physics": {"gravity": 16.0, "stepHz": 60, "subSteps": 4,
                "friction": {"mud": 0.6, "stone": 0.45, "ice": 0.05}},
    "partsBox": {"wood_frame": 4, "wood_wheel": 2, "motor": 1, "battery": 1, "pig": 1},
    "mapRows": as_strings(rows),
    "materials": [{"surfaceRow": FLOOR, "cols": [0, 61], "type": "mud"},
                  {"surfaceRow": 7, "cols": [63, cols - 1], "type": "stone"}],
    "boxes": [{"col": 25, "row": 7}, {"col": 45, "row": 7}],
    "challenge": {"type": "energyLeft", "min": 30},
    "timeLimit": 120,
})

# ---------------- 1-4 冰面 ----------------
# 冰面助跑(0..7, 6 m) → 1:2 冰坡(8..14, 升 3 m) → 冰台(15..40) → 泥地(41..59) → 终点
# 木轮在冰上最大加速度 2.3 m/s²，坡需要 7.1 → 必然滑回；铁轮 10.6 → 能上。
cols = 60
rows = blank(cols)
CLIMB_C0, CLIMB_C1, ICE_TOP = 8, 14, 5
for c in range(0, cols):
    if c < CLIMB_C0:
        top = FLOOR
    elif c <= CLIMB_C1:
        top = FLOOR - round((FLOOR - ICE_TOP) * (c - CLIMB_C0 + 1) / (CLIMB_C1 - CLIMB_C0 + 1))
    elif c <= 40:
        top = ICE_TOP
    else:
        top = FLOOR
    for r in range(top, ROWS):
        rows[r][c] = "#"
    if c <= 40:
        rows[top][c] = "="              # 冰面（连斜坡和台子都是冰）
put(rows, 1, 7, "S")                   # 起点就在冰面上
put(rows, 30, ICE_TOP - 1, "E")        # 终点在冰台上
put(rows, 4, 7, "B")                   # 木箱在助跑段
levels.append({
    "levelId": "1-4", "name": "冰面", "chapter": 1, "biome": "ice",
    "grid": {"cols": cols, "rows": ROWS, "cell": 1.0, "px": 32},
    "buildArea": {"cols": 6, "rows": 8},
    "start": {"col": 1, "row": 7}, "goal": {"col": 30, "row": ICE_TOP - 1},
    "physics": {"gravity": 16.0, "stepHz": 60, "subSteps": 4,
                "friction": {"mud": 0.6, "stone": 0.45, "ice": 0.05}},
    "partsBox": {"wood_frame": 4, "wood_wheel": 2, "iron_wheel": 2,
                 "motor": 1, "battery": 1, "pig": 1},
    "mapRows": as_strings(rows),
    "materials": [{"surfaceRow": FLOOR, "cols": [0, 40], "type": "ice"},
                  {"surfaceRow": FLOOR, "cols": [41, cols - 1], "type": "mud"}],
    "boxes": [{"col": 4, "row": 7}],
    "challenge": {"type": "noFlip", "maxAngle": 0.785},
    "timeLimit": 120,
})

# ---------------- 1-5 第一道坎 ----------------
# 坡路开局(0..11, 3 m 落差) → 平地 → 1 m 深凹沟(15..17, 沟底有木箱) → 平地 → 终点(同一层)
# 无马达：靠坡上攒的动量冲过凹沟 → ★★★；带马达：可以下沟拿木箱再爬出来 → ★★
cols = 48
rows = blank(cols)
ramp_start(rows, cols, high_row=5, flat_row=FLOOR, ramp_cols=12)
for c in range(15, 18):                # 1 m 深、3 m 宽的凹沟
    rows[FLOOR][c] = "."
    rows[FLOOR + 1][c] = "#"
    for r in range(FLOOR + 2, ROWS):
        rows[r][c] = "#"
put(rows, 16, 8, "B")                  # 沟底木箱
put(rows, 1, 4, "S")
put(rows, 25, 7, "E")
levels.append({
    "levelId": "1-5", "name": "第一道坎", "chapter": 1, "biome": "dusk",
    "grid": {"cols": cols, "rows": ROWS, "cell": 1.0, "px": 32},
    "buildArea": {"cols": 6, "rows": 8},
    "start": {"col": 1, "row": 4}, "goal": {"col": 25, "row": 7},
    "physics": {"gravity": 16.0, "stepHz": 60, "subSteps": 4,
                "friction": {"mud": 0.6, "stone": 0.45, "ice": 0.05}},
    "partsBox": {"wood_frame": 4, "wood_wheel": 2, "motor": 1, "pig": 1},
    "mapRows": as_strings(rows),
    "materials": [{"surfaceRow": FLOOR, "cols": [0, cols - 1], "type": "mud"}],
    "boxes": [{"col": 16, "row": 8}],
    "challenge": {"type": "motorUse", "max": 0},
    "timeLimit": 120,
})

# ---------------- 写盘 + 校验 ----------------
problems = []
for lv in levels:
    rows = lv["mapRows"]
    g = lv["grid"]
    if len(rows) != g["rows"]:
        problems.append(f"{lv['levelId']}: 行数 {len(rows)} != {g['rows']}")
    for i, r in enumerate(rows):
        if len(r) != g["cols"]:
            problems.append(f"{lv['levelId']}: 第 {i} 行宽 {len(r)} != {g['cols']}")
    joined = "".join(rows)
    if joined.count("S") != 1:
        problems.append(f"{lv['levelId']}: S 数量 {joined.count('S')}")
    if joined.count("E") != 1:
        problems.append(f"{lv['levelId']}: E 数量 {joined.count('E')}")
    if joined.count("B") != len(lv["boxes"]):
        problems.append(f"{lv['levelId']}: B {joined.count('B')} != boxes {len(lv['boxes'])}")
    # 起点/终点/木箱坐标与地图符号一致
    for key, ch in (("start", "S"), ("goal", "E")):
        c, r = lv[key]["col"], lv[key]["row"]
        if rows[r][c] != ch:
            problems.append(f"{lv['levelId']}: {key}({c},{r}) 地图是 '{rows[r][c]}'")
    for b in lv["boxes"]:
        if rows[b["row"]][b["col"]] != "B":
            problems.append(f"{lv['levelId']}: box({b['col']},{b['row']}) 地图是 '{rows[b['row']][b['col']]}'")
    # 起点下方要有实体（不能悬空在人造空腔里）
    sc, sr = lv["start"]["col"], lv["start"]["row"]
    if rows[sr + 1][sc] not in "#=":
        problems.append(f"{lv['levelId']}: 起点下方不是实体（{rows[sr + 1][sc]}）")

for i, lv in enumerate(levels, 1):
    path = OUT / f"{i:02d}.json"
    path.write_text(json.dumps(lv, ensure_ascii=False, indent=1), encoding="utf-8")

print(f"wrote {len(levels)} levels")
for lv in levels:
    print(f"  {lv['levelId']} {lv['name']}: {lv['grid']['cols']}x{lv['grid']['rows']} "
          f"parts={sum(lv['partsBox'].values())} boxes={len(lv['boxes'])} "
          f"challenge={lv['challenge']['type']}")
if problems:
    print("PROBLEMS:")
    for p in problems:
        print("  -", p)
else:
    print("all levels self-consistent ✓")

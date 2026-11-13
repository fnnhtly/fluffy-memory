"""生成"官方 imageId 探针"存档：把一批 imageId 铺成网格，方便截图后肉眼辨认是什么素材。

用法：python tools/make_image_probe.py <page> [--ids a,b,c]
输出 workspace/roll-away-pig/probe/image-probe-<page>.save.json
"""
import copy
import json
import pathlib
import sys

BASE = pathlib.Path("../tumble-piggy/tumble-piggy.save.json")
OUT = pathlib.Path("probe")
OUT.mkdir(exist_ok=True)

# 官方 imageId 白名单（从模拟器 dist/worker.js 的 r0 表读出来）
RANGES = [
    (100001, 100006), (100101, 100213),
    (101001, 101018), (101020, 101028), (101030, 101046), (101048, 101048),
    (101050, 101054), (101056, 101080),
    (102001, 102052), (103001, 103148), (104001, 104010),
    (105001, 105140), (105142, 105219), (105221, 105317),
    (106001, 106047), (106049, 106096),
    (107001, 107007), (107010, 107020), (107031, 107092), (107094, 107180),
    (107183, 107201), (107203, 107205), (107207, 107228), (107231, 107278), (107280, 107402),
    (108001, 108017), (108019, 108020),
    (109001, 109031), (109033, 109034), (109036, 109075),
    (110001, 110053), (111001, 111139), (112001, 112042),
]


def sample_ids(per_range=2):
    """每个范围取开头两个 + 中间一个，尽量广撒网。"""
    ids = []
    for lo, hi in RANGES:
        ids.append(lo)
        if hi - lo >= 1:
            ids.append(lo + 1)
        if hi - lo >= 6:
            ids.append((lo + hi) // 2)
    # 去重保序
    seen, out = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def main():
    page = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    if "--ids" in sys.argv:
        ids = [int(x) for x in sys.argv[sys.argv.index("--ids") + 1].split(",")]
    else:
        all_ids = sample_ids()
        per_page = 70
        ids = all_ids[page * per_page:(page + 1) * per_page]

    save = json.loads(BASE.read_text(encoding="utf-8"))
    world = save["assets"]["server"]["root"]["children"][0]
    template = world["children"][0]          # LoopRing（image 节点）
    world["children"] = []
    for i in (1, 2):
        if len(world.get("children", [])) == 0:
            break

    COLS, ROWS = 10, 7
    W, H = 122, 92
    for idx, img_id in enumerate(ids[:COLS * ROWS]):
        col, row = idx % COLS, idx // COLS
        node = copy.deepcopy(template)
        node["id"] = f"probe{idx}"
        node["guid"] = 1073750000 + idx
        node["name"] = f"P{img_id}"
        node["active"] = True
        node["visible"] = True
        node["imageId"] = img_id
        node["imageColor"] = 0xFFFFFFFF
        for platform in node["transformByPlatform"].values():
            platform["anchorMin"] = {"x": 0.5, "y": 0.5}
            platform["anchorMax"] = {"x": 0.5, "y": 0.5}
            platform["size"] = {"x": W - 4, "y": H - 4}
            platform["offset"] = {
                "x": (col + 0.5) * W - 640,
                "y": 360 - (row + 0.5) * H,
            }
            platform["pivot"] = {"x": 0.5, "y": 0.5}
        world["children"].append(node)

    save["canvasId"] = "mobile-16-9"
    path = OUT / f"image-probe-{page}.save.json"
    path.write_text(json.dumps(save, ensure_ascii=False), encoding="utf-8")
    print(f"written {path}")
    print("ids:", ids[:COLS * ROWS])


if __name__ == "__main__":
    main()

"""生成 tests/*.json（qxqy-autotest v1）。用例设计见 tests/cases.md。

每个用例都以点 LevelTab_<n> 进关，保证互相独立、不依赖前序关卡。
"""
import json
import pathlib

OUT = pathlib.Path("tests")
DT = 1 / 30

# 零件名 -> 零件箱控件名
TRAY = {
    "wood_frame": "Tray_wood_frame",
    "wood_wheel": "Tray_wood_wheel",
    "iron_wheel": "Tray_iron_wheel",
    "motor": "Tray_motor",
    "battery": "Tray_battery",
    "pump": "Tray_pump",
    "pig": "Tray_pig",
}


def cell(r, c):
    return f"Cell_{r}_{c}"


def place(t, draft, part, cells, step=0.25):
    """选中一个零件后依次点若干格；返回推进后的时间。"""
    draft.append((t, "click", {"name": TRAY[part]}))
    t += step
    for r, c in cells:
        draft.append((t, "click", {"name": cell(r, c)}))
        t += step
    return t


def click(t, name):
    return (t, "click", {"name": name})


def case(name, events, asserts):
    ev = []
    for t, kind, payload in events:
        ev.append({"t": round(t, 3), "kind": kind, "payload": payload})
    return {
        "format": "qxqy-autotest",
        "version": 1,
        "name": name,
        "dt": DT,
        "events": ev,
        "asserts": asserts,
    }


def log(at, contains):
    return {"at": at, "kind": "log", "contains": contains}


def tree(at, name, exists=True):
    return {"at": at, "kind": "tree", "name": name, "exists": exists}


def enter(t, level):
    return click(t, f"LevelTab_{level}")


# 1-1 标准解：木框 ×3（第 4 行 c1..c3）+ 木轮 ×2（第 5 行 c1、c3）+ 小猪塞进中间木框 (4,2)
L1_FRAMES = [(4, 1), (4, 2), (4, 3)]
L1_WHEELS = [(5, 1), (5, 3)]

# 1-2 标准解：同样车身 + 打气筒放在第 3 行 c2
L2_FRAMES = [(4, 1), (4, 2), (4, 3)]
L2_WHEELS = [(5, 1), (5, 3)]
L2_PUMP = [(3, 2)]

# 1-3 需要马达 + 电池
L3_FRAMES = [(4, 1), (4, 2), (4, 3), (4, 4)]
L3_WHEELS = [(5, 1), (5, 4)]
L3_MOTOR = [(4, 0)]
L3_BATTERY = [(4, 3)]   # 电池是内嵌件：放进第 4 个木框

# 1-4 冰面：铁轮
L4_FRAMES = [(4, 1), (4, 2), (4, 3), (4, 4)]
L4_IRON = [(5, 1), (5, 4)]
L4_MOTOR = [(4, 0)]
L4_BATTERY = [(4, 3)]

# 1-5 沟：长车（4 格）
L5_FRAMES = [(4, 0), (4, 1), (4, 2), (4, 3)]
L5_WHEELS = [(5, 0), (5, 3)]


def build_l1(t=0.3, with_wheels=True, with_pig=True):
    ev = [enter(t, 1)]
    t += 0.3
    t = place(t, ev, "wood_frame", L1_FRAMES)
    if with_wheels:
        t = place(t, ev, "wood_wheel", L1_WHEELS)
    if with_pig:
        t = place(t, ev, "pig", [(4, 2)])      # 小猪塞进中空木框
    return ev, t


files = {}

# T17 方向件：再点一次已放的打气筒 → 朝向 0→1，发射后按交互键
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

# T16 发射守卫：没放小猪不许发射
ev = [enter(0.3, 1)]
t = 0.6
t = place(t, ev, "wood_frame", L1_FRAMES)
t = place(t, ev, "wood_wheel", L1_WHEELS)
ev.append(click(t, "LaunchButton"))
files["t16-pig-guard.json"] = case("t16-pig-guard", ev, [
    log(2.2, "launch_blocked reason=pig"),
])

# T01 boot
files["t01-boot.json"] = case("t01-boot", [], [
    log(0.2, "game_start"),
    log(0.2, "phase build"),
    tree(0.2, "WorldRoot", True),
    tree(0.2, "Cell_0_0", True),
])

# T02 首关通关（2 星：★ + ★★ 木箱）
ev, t = build_l1()
ev.append(click(t, "LaunchButton"))
files["t02-level1-win.json"] = case("t02-level1-win", ev, [
    log(2.2, "launch mass="),
    log(20, "box 1"),
    log(20, "win stars=2"),
    tree(20, "NextButton", True),
])

# T03 预算：1-1 连放 4 块木框
ev = [enter(0.3, 1)]
t = 0.6
ev.append(click(t, TRAY["wood_frame"]))
t += 0.25
for r, c in [(4, 1), (4, 2), (4, 3), (4, 4)]:
    ev.append(click(t, cell(r, c)))
    t += 0.25
files["t03-budget.json"] = case("t03-budget", ev, [
    log(2.2, "build_place part=wood_frame cell=4,3 left=0"),
    log(2.2, "build_blocked reason=budget"),
])

# T04 无效车：2 块木框、无轮子 → stuck
ev, t = build_l1(with_wheels=False)
ev.append(click(t, "LaunchButton"))
files["t04-stuck.json"] = case("t04-stuck", ev, [
    log(2.2, "launch mass="),
    log(20, "fail stuck"),
    log(20, "phase resolved"),
])

# T05 打气筒按下（2 星：木箱到手）
ev = [enter(0.3, 2)]
t = 0.6
t = place(t, ev, "wood_frame", L2_FRAMES)
t = place(t, ev, "wood_wheel", L2_WHEELS)
t = place(t, ev, "pump", L2_PUMP)
ev.append(click(t, "LaunchButton"))
t += 1.2
ev.append(click(t, "Interact_1"))
files["t05-pump.json"] = case("t05-pump", ev, [
    log(2.2, "launch mass="),
    log(3.0, "interact_key n=1 part=pump"),
    log(3.2, "pump_release"),
    log(25, "win stars=2"),
])

# T06 不按打气筒（3 星）
ev = [enter(0.3, 2)]
t = 0.6
t = place(t, ev, "wood_frame", L2_FRAMES)
t = place(t, ev, "wood_wheel", L2_WHEELS)
t = place(t, ev, "pump", L2_PUMP)
ev.append(click(t, "LaunchButton"))
files["t06-pump-skip.json"] = case("t06-pump-skip", ev, [
    log(25, "win stars=3"),
    tree(25, "RetryButton", True),
])

# T07 交互键上限：连放 4 个打气筒
ev = [enter(0.3, 2)]
t = 0.6
t = place(t, ev, "wood_frame", L2_FRAMES)
t = place(t, ev, "pump", [(3, 1), (3, 2), (3, 3), (2, 2)])
files["t07-interact-limit.json"] = case("t07-interact-limit", ev, [
    log(3.0, "build_place part=pump cell=3,3"),
    log(3.2, "build_blocked reason=interact_limit"),
    tree(3.2, "Interact_1", False),      # 建造阶段还没有运行期按钮
])

# T08 能量（3 星）
ev = [enter(0.3, 3)]
t = 0.6
t = place(t, ev, "wood_frame", L3_FRAMES)
t = place(t, ev, "wood_wheel", L3_WHEELS)
t = place(t, ev, "motor", L3_MOTOR)
t = place(t, ev, "battery", L3_BATTERY)
ev.append(click(t, "LaunchButton"))
files["t08-energy.json"] = case("t08-energy", ev, [
    log(2.4, "launch mass="),
    log(25, "motor_on"),
    log(40, "win stars=3"),
])

# T09 无电池 → motor_out
ev = [enter(0.3, 3)]
t = 0.6
t = place(t, ev, "wood_frame", L3_FRAMES)
t = place(t, ev, "wood_wheel", L3_WHEELS)
t = place(t, ev, "motor", L3_MOTOR)
ev.append(click(t, "LaunchButton"))
files["t09-no-battery.json"] = case("t09-no-battery", ev, [
    log(2.4, "launch mass="),
    log(4, "motor_out"),
    log(40, "fail"),
])

# T10 木轮跑冰面 → 冰坡上打滑，过不去
ev = [enter(0.3, 4)]
t = 0.6
t = place(t, ev, "wood_frame", L4_FRAMES)
t = place(t, ev, "wood_wheel", [(5, 1), (5, 4)])
t = place(t, ev, "motor", L4_MOTOR)
t = place(t, ev, "battery", L4_BATTERY)
ev.append(click(t, "LaunchButton"))
files["t10-ice-wood.json"] = case("t10-ice-wood", ev, [
    log(2.4, "launch mass="),
    log(60, "fail"),
])

# T11 铁轮跑冰面 → 不翻车、3 星
ev = [enter(0.3, 4)]
t = 0.6
t = place(t, ev, "wood_frame", L4_FRAMES)
t = place(t, ev, "iron_wheel", L4_IRON)
t = place(t, ev, "motor", L4_MOTOR)
t = place(t, ev, "battery", L4_BATTERY)
ev.append(click(t, "LaunchButton"))
files["t11-ice-iron.json"] = case("t11-ice-iron", ev, [
    log(2.4, "launch mass="),
    log(60, "win stars=3"),
])

# T12 沟底木箱（用马达，2 星）
ev = [enter(0.3, 5)]
t = 0.6
t = place(t, ev, "wood_frame", L5_FRAMES)
t = place(t, ev, "wood_wheel", L5_WHEELS)
t = place(t, ev, "motor", [(3, 1)])
ev.append(click(t, "LaunchButton"))
files["t12-gully-box.json"] = case("t12-gully-box", ev, [
    log(2.4, "launch mass="),
    log(45, "box 1"),
    log(45, "win stars=2"),
])

# T13 禁用马达（靠坡上动量冲过沟 → 3 星；见 README 已知弱点）
ev = [enter(0.3, 5)]
t = 0.6
t = place(t, ev, "wood_frame", L5_FRAMES)
t = place(t, ev, "wood_wheel", L5_WHEELS)
ev.append(click(t, "LaunchButton"))
files["t13-gully-no-motor.json"] = case("t13-gully-no-motor", ev, [
    log(2.4, "launch mass="),
    log(45, "win stars=3"),
])

# T14 一秒重开：1-1 结算 → 重试
ev, t = build_l1()
ev.append(click(t, "LaunchButton"))
ev.append(click(20, "RetryButton"))
files["t14-restart.json"] = case("t14-restart", ev, [
    log(20, "win stars="),
    log(21, "restart"),
    log(21, "phase build"),
    tree(21, "Cell_0_0", True),
])

# T15 跨关：1-1 通关 → 下一关
ev, t = build_l1()
ev.append(click(t, "LaunchButton"))
ev.append(click(20, "NextButton"))
files["t15-next-level.json"] = case("t15-next-level", ev, [
    log(20, "win stars="),
    log(21, "next_level 2"),
    log(21, "level 2"),
])

for name, data in files.items():
    (OUT / name).write_text(
        json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8"
    )

print(f"wrote {len(files)} case files to {OUT}")
for name in sorted(files):
    print("  ", name, "events:", len(files[name]["events"]),
          "asserts:", len(files[name]["asserts"]))

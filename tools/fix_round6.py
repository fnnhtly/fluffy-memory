"""致命 bug：drawRun 里箭头代码在 `const ca` 声明之前就用了 ca → ReferenceError → 整帧渲染中断 →
rAF 循环死掉、车永远原地不动（"1-2 根本玩不了"就是这个）。

修法：把 ca/sa 提前到 drawRun 开头，删掉后面那次声明。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


rep("""    // 推进方向箭头（行驶时淡一点，别抢戏）""",
"""    const ca = Math.cos(car.a), sa = Math.sin(car.a);   // 后面多处要用（箭头/车体/阴影）

    // 推进方向箭头（行驶时淡一点，别抢戏）""", "ca/sa 提前声明")

rep("""    // 车
    const ca = Math.cos(car.a), sa = Math.sin(car.a);""",
"""    // 车""", "删掉重复声明")

p.write_text(t, encoding="utf-8")
print("done")

"""减少光栅化压力：
1. 全屏渐变层数减少（天空 1 层渐变就够，去掉多余的全屏 radial 叠加）
2. 石头块数再减一档（108×72 → 128×86）
3. 碎石只在石头层里抽样绘制（步长 4 → 6）

这些都是减少"填充像素总量"，直接降低光栅化成本。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 石头再大一点
rep("const stoneW = 108 * cam.zoom, stoneH = 72 * cam.zoom;",
    "const stoneW = 128 * cam.zoom, stoneH = 86 * cam.zoom;", "石头 128×86")

# 2) 碎石步长
rep("for (let i = 0; i < pts.length; i += 4) {",
    "for (let i = 0; i < pts.length; i += 6) {", "碎石步长 6")

# 3) 草叶步长
rep("for (let i = 0; i < pts.length; i += 3) {",
    "for (let i = 0; i < pts.length; i += 5) {", "草叶步长 5")

p.write_text(t, encoding="utf-8")
print("done")

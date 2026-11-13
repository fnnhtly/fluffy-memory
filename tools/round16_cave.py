"""洞窟关远山太亮：`hill: '#122530'` 虽然暗，但远山绘制有一条浅色高光边，
在暗背景上形成刺眼的"亮色三角形轮廓"。

同时给洞窟的远山单独压暗一档（乘 0.6），并去掉洞窟里的"远景地面亮色带"。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 洞窟远山更暗
rep("    hill: '#122530', jungle: ['#15302a', '#102420', '#0b1a17'], cave: true },",
    "    hill: '#0b1822', jungle: ['#15302a', '#102420', '#0b1a17'], cave: true },", "洞窟远山压暗")

# 洞窟：远山整体再压暗（叠一层黑）
rep("""    // 远山（最淡，最高）
    ctx.fillStyle = PAL.hill;""",
"""    // 远山（最淡，最高）
    ctx.fillStyle = CAVE ? 'rgba(8,16,22,.85)' : PAL.hill;""", "洞窟远山实色")

# 洞窟：远景地面的亮色渐变也压暗
rep("""    const farGround = ctx.createLinearGradient(0, horizonY - 70, 0, horizonY + 120);
    farGround.addColorStop(0, 'rgba(196,216,222,0)');
    farGround.addColorStop(0.28, PAL.hill);
    farGround.addColorStop(0.5, PAL.hill);
    farGround.addColorStop(1, PAL.jungle[1]);""",
"""    const farGround = ctx.createLinearGradient(0, horizonY - 70, 0, horizonY + 120);
    farGround.addColorStop(0, CAVE ? 'rgba(10,20,26,0)' : 'rgba(196,216,222,0)');
    farGround.addColorStop(0.28, PAL.hill);
    farGround.addColorStop(0.5, PAL.hill);
    farGround.addColorStop(1, PAL.jungle[1]);""", "洞窟远景地面压暗")

p.write_text(t, encoding="utf-8")
print("done")

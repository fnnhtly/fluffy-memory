"""修天空漏白：远山峰线（horizonY+30）到远景丛林顶之间有空白，直接露天空。
在画远山之前先铺一条"远景地面"矩形，从 horizonY+20 一直盖到 horizonY+110。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

old = """    const horizonY = toY(ter.surfaceY(cam.x) + 2.6);
    // 远山（最淡，最高）
    ctx.fillStyle = COL.hillFar;"""
new = """    const horizonY = toY(ter.surfaceY(cam.x) + 2.6);
    // 远景地面：先铺满，避免远山与丛林之间漏出天空
    const farGround = ctx.createLinearGradient(0, horizonY + 16, 0, horizonY + 120);
    farGround.addColorStop(0, '#7CA0B2');
    farGround.addColorStop(0.4, '#5F8A93');
    farGround.addColorStop(1, '#3E6B5C');
    ctx.fillStyle = farGround;
    ctx.fillRect(0, horizonY + 16, DW, 110);
    // 远山（最淡，最高）
    ctx.fillStyle = COL.hillFar;"""
assert old in t, "hill block not found"
t = t.replace(old, new)
p.write_text(t, encoding="utf-8")
print("远景地面已铺")

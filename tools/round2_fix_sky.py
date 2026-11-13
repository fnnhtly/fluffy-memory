"""修：远山下方露出大片奶白色天空。
原因：远山只画到 horizonY+34，而丛林顶部在 horizonY+62~96 之间，
中间那段没有任何东西，直接露出天空渐变的下半部（淡黄白）。
修法：远山峰线以下铺一条实心"远景地面"矩形，一直盖到近景丛林顶。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

old = """    // 远山与丛林之间的实心过渡带（挡住山峰"透缝"）
    ctx.fillStyle = '#5E8A94';
    ctx.fillRect(0, horizonY + 26, DW, 22);"""
new = """    // 远山以下的"远景地面"：一直盖到近景丛林顶部，别让天空从缝里漏出来
    const farGround = ctx.createLinearGradient(0, horizonY + 20, 0, horizonY + 120);
    farGround.addColorStop(0, '#6E93A6');
    farGround.addColorStop(0.45, '#5A8290');
    farGround.addColorStop(1, '#3E6B5C');
    ctx.fillStyle = farGround;
    ctx.fillRect(0, horizonY + 20, DW, 110);

    // 云雾：让远景地面和丛林衔接自然
    const haze = ctx.createLinearGradient(0, horizonY + 30, 0, horizonY + 110);
    haze.addColorStop(0, 'rgba(235,245,235,0)');
    haze.addColorStop(0.55, 'rgba(235,245,235,.34)');
    haze.addColorStop(1, 'rgba(235,245,235,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizonY + 30, DW, 90);"""
assert old in t, "transition band not found"
t = t.replace(old, new)
p.write_text(t, encoding="utf-8")
print("远景地面过渡带加高")

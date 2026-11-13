"""修"零件说明关不掉"：面板打开时，点面板任意位置（或点 ✕）就关；并画一个明显的 ✕。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why.encode("ascii", "replace").decode())


# 1) mousedown 最前面：面板开着时，任何点击都先关面板
rep("""    // 顶部关卡页签
    for (let i = 0; i < levels.length; i++) {""",
"""    // 零件说明面板开着时：点任何地方都先关掉它（不会误触到下面的按钮）
    if (state.helpOpen) { state.helpOpen = false; return; }

    // 顶部关卡页签
    for (let i = 0; i < levels.length; i++) {""", "面板开启时任意点击关闭")

# 2) 面板右上角画 ✕
rep("""    text('按 H 或点「? 零件说明」关闭', X + W - 26, Y + H - 18, 12, '#7f97a6', 'right');""",
"""    // 右上角关闭按钮
    const cb = { x: X + W - 56, y: Y + 16, w: 34, h: 34 };
    ctx.fillStyle = 'rgba(224,81,60,.9)';
    ctx.beginPath(); ctx.arc(cb.x + cb.w / 2, cb.y + cb.h / 2, 17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    const ccx = cb.x + cb.w / 2, ccy = cb.y + cb.h / 2;
    ctx.beginPath();
    ctx.moveTo(ccx - 7, ccy - 7); ctx.lineTo(ccx + 7, ccy + 7);
    ctx.moveTo(ccx + 7, ccy - 7); ctx.lineTo(ccx - 7, ccy + 7);
    ctx.stroke();
    text('点任意处关闭 / 按 H', X + W - 26, Y + H - 18, 12, '#7f97a6', 'right');""",
    "面板 ✕ 与提示")

p.write_text(t, encoding="utf-8")
print("done")

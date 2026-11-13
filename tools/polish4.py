"""打磨第五轮（收尾这三处残留）：
1) 左侧三钮底板仍连成一片 → 底板高度从 h+30 收到 h+26，并减淡底色
2) 底部提示行仍压到"小猪"槽名 → 再抬高到 DH-128，并改半透明小字
3) 小车在网格里只占 3×2 格，网格显得空 → 把车放大 1.15 倍（视觉），并给网格加"底衬板"
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 底板
rep("        roundRect(rect.x - 8, rect.y - 8, rect.w + 16, rect.h + 30, 12); ctx.fill();",
    "        roundRect(rect.x - 8, rect.y - 6, rect.w + 16, rect.h + 24, 12); ctx.fill();", "底板收紧")
rep("        ctx.fillStyle = 'rgba(10,18,24,.72)';",
    "        ctx.fillStyle = 'rgba(10,18,24,.5)';", "底板减淡")

# 2) 提示行抬高
rep("        DW / 2, DH - 104, 11, 'rgba(200,218,232,.75)', 'center');",
    "        DW / 2, DH - 130, 10.5, 'rgba(200,218,232,.55)', 'center');", "提示行抬高")

# 3) 网格底衬板（让 6×8 区域有"建造台"的感觉）
rep("""  function drawGrid() {
    if (state.phase !== 'build') return;
    const o = buildOrigin();""",
"""  function drawGrid() {
    if (state.phase !== 'build') return;
    const o = buildOrigin();
    // 建造台底衬：一块半透明板，让网格从背景里"浮"出来
    const padX = 10, padY = 34;
    ctx.fillStyle = 'rgba(10,18,24,.34)';
    roundRect(o.x - padX, o.y - padY, RAP.BUILD_COLS * BUILD_PX + padX * 2,
      RAP.BUILD_ROWS * BUILD_PX + padY + 16, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(232,200,122,.28)'; ctx.lineWidth = 1.5; ctx.stroke();
    text('建造台  6 × 8', o.x - padX + 12, o.y - 14, 12, '#ffe9b0', 'left', true);""",
    "建造台底衬")

p.write_text(t, encoding="utf-8")
print("done")

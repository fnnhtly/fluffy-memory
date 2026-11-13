"""打磨第三轮：修三处实际的视觉问题
1) 底部 HTML 提示条压在零件槽数字上 → 删掉 HTML #hint，改成画布内一行（放顶部 HUD 下方）
2) 左侧三个圆钮的文字标签被地形吞掉 → 加半透明底板
3) 建造网格偏小（只占屏宽 19%）→ 40px → 46px，上移，右侧空出来放"整车统计卡"
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) 删掉 HTML 底部提示 ----------
rep("""<div id="hint">左键拖/点放零件 · 方向件：右键 / R / 再点一次换方向 · Z 撤销 · C 清空 · 空格发射 · 1/2/3 交互键 · T 调参</div>""",
    "", "删掉 HTML hint")
rep("""  #hint { position: fixed; left: 12px; bottom: 8px; color: #7f8c99; font-size: 12px; user-select: none; }
""", "", "删掉 hint 样式")

# ---------- 2) 网格放大 ----------
rep("  const BUILD_PX = 40;   // 建造格显示尺寸（比物理 32px/米 大一点，和参考比例接近）",
    "  const BUILD_PX = 46;   // 建造格显示尺寸", "网格 46px")
rep("  const buildOrigin = () => ({ x: DW / 2 - RAP.BUILD_COLS * BUILD_PX / 2, y: 150 });",
    "  const buildOrigin = () => ({ x: DW / 2 - RAP.BUILD_COLS * BUILD_PX / 2 - 40, y: 128 });", "网格位置")

# ---------- 3) 左侧圆钮加底板 ----------
rep("""      const knob = (rect, drawIcon, label, active) => {
        const c = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };""",
"""      const knob = (rect, drawIcon, label, active) => {
        const c = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
        // 底板：避免文字被地形吞掉
        ctx.fillStyle = 'rgba(10,18,24,.72)';
        roundRect(rect.x - 8, rect.y - 8, rect.w + 16, rect.h + 30, 12); ctx.fill();""",
    "圆钮底板")

# 文字颜色提亮
rep("        text(label, c.x, rect.y + rect.h + 16, 11, active ? '#cfe4f5' : '#8fa3b3', 'center');",
    "        text(label, c.x, rect.y + rect.h + 16, 11.5, active ? '#e8f4ff' : '#c3d4e2', 'center');",
    "圆钮文字提亮")

# ---------- 4) 画布底部内嵌提示行（替代 HTML hint） ----------
rep("""      const boxParts = Object.keys(level().partsBox || {})
        .map(k => (RAP.PARTS[k] ? RAP.PARTS[k].label : k) + '×' + level().partsBox[k]).join('　');""",
"""      // 操作提示（画布内，放最底部一行，不与零件槽重叠）
      text('左键放件 · 拖动已放的件可移动 · 右键/R 换方向 · Z 撤销 · C 清空 · 空格出发 · T 调参 · H 零件说明',
        DW / 2, DH - 8, 11, 'rgba(190,210,225,.6)', 'center');
      const boxParts = Object.keys(level().partsBox || {})
        .map(k => (RAP.PARTS[k] ? RAP.PARTS[k].label : k) + '×' + level().partsBox[k]).join('　');""",
    "画布内提示行")

p.write_text(t, encoding="utf-8")
print("done")

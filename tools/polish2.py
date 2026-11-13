"""打磨第四轮：
1) 左侧三个圆钮拉开间距（78 → 96px），底板不再连成一片
2) 底部提示行从 DH-8 挪到零件槽上方（DH-118），彻底离开数字
3) 右侧加"整车统计卡"：质量/能量/交互键/重心，填掉空白
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) 三个钮拉开 ----------
rep("      if (name === 'clear') return { x: 84, y: 324, w: 56, h: 56 };",
    "      if (name === 'clear') return { x: 84, y: 300, w: 56, h: 56 };", "清空 y300")
rep("      if (name === 'undo') return { x: 84, y: 392, w: 56, h: 56 };",
    "      if (name === 'undo') return { x: 84, y: 396, w: 56, h: 56 };", "撤销 y396")
rep("      if (name === 'rotate') return { x: 84, y: 460, w: 56, h: 56 };",
    "      if (name === 'rotate') return { x: 84, y: 492, w: 56, h: 56 };", "换方向 y492")

# ---------- 2) 提示行挪到槽上方 ----------
rep("""      text('左键放件 · 拖动已放的件可移动 · 右键/R 换方向 · Z 撤销 · C 清空 · 空格出发 · T 调参 · H 零件说明',
        DW / 2, DH - 8, 11, 'rgba(190,210,225,.6)', 'center');""",
"""      text('左键放件 · 拖动可移动 · 右键/R 换方向 · Z 撤销 · C 清空 · 空格出发 · T 调参 · H 零件说明',
        DW / 2, DH - 104, 11, 'rgba(200,218,232,.72)', 'center');""", "提示行到槽上方")

# ---------- 3) 右侧统计卡 ----------
rep("""      // 当前选中零件的说明（一行）""",
"""      // 右侧：整车统计卡（把右边的空白填起来，也方便看数值）
      const CX = DW - 236, CY = 150, CW = 196;
      ctx.fillStyle = 'rgba(12,20,26,.78)';
      roundRect(CX, CY, CW, 196, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(232,200,122,.35)'; ctx.lineWidth = 1; ctx.stroke();
      text('整车', CX + 14, CY + 24, 13, '#9fd66a', 'left', true);
      const rows2 = [
        ['质量', mass.toFixed(1) + ' kg'],
        ['能量', String(Math.round(energy))],
        ['交互键', (built ? built.interactives.length : 0) + ' / ' + RAP.Params.interactCap],
        ['零件数', String(built ? built.parts.length : 0)],
        ['', '']
      ];
      if (built && built.parts.length) {
        let mx2 = 0, mm2 = 0;
        built.parts.forEach(pp => { mx2 += pp.lx * pp.def.mass; mm2 += pp.def.mass; });
        const off = mx2 / mm2 - built.center.x;
        rows2[4] = ['重心偏移', (off >= 0 ? '+' : '−') + Math.abs(off).toFixed(2) + ' m'];
      }
      rows2.forEach((r, i) => {
        const yy = CY + 52 + i * 28;
        text(r[0], CX + 14, yy, 12, '#8fb6c9', 'left');
        const warn = (i === 4 && built && built.parts.length &&
          Math.abs((function () {
            let mx3 = 0, mm3 = 0;
            built.parts.forEach(pp => { mx3 += pp.lx * pp.def.mass; mm3 += pp.def.mass; });
            return mx3 / mm3 - built.center.x;
          })()) > 0.7);
        text(r[1], CX + CW - 14, yy, 14, warn ? '#ffb4a2' : '#e8f2fa', 'right', true);
      });

      // 当前选中零件的说明（一行）""", "右侧统计卡")

p.write_text(t, encoding="utf-8")
print("done")

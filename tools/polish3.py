"""打磨第四轮（按实际内容精确插入）：
1) 底部提示行挪到零件槽上方
2) 右侧加整车统计卡
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 提示行位置
rep("""      text('左键放件 · 拖动已放的件可移动 · 右键/R 换方向 · Z 撤销 · C 清空 · 空格出发 · T 调参 · H 零件说明',
        DW / 2, DH - 8, 11, 'rgba(190,210,225,.6)', 'center');""",
"""      text('左键放件 · 拖动可移动 · 右键/R 换方向 · Z 撤销 · C 清空 · 空格出发 · T 调参 · H 零件说明',
        DW / 2, DH - 104, 11, 'rgba(200,218,232,.75)', 'center');""", "提示行到槽上方")

# 2) 右侧统计卡（插在"重心偏移"之前）
rep("""      // 重心偏移：让玩家知道"车头偏重 / 整体太高"
      if (built && built.parts.length) {""",
"""      // ---- 右侧整车统计卡 ----
      {
        const CX = DW - 232, CY = 148, CW = 200, CH = 188;
        ctx.fillStyle = 'rgba(12,20,26,.78)';
        roundRect(CX, CY, CW, CH, 12); ctx.fill();
        ctx.strokeStyle = 'rgba(232,200,122,.32)'; ctx.lineWidth = 1; ctx.stroke();
        text('整车', CX + 14, CY + 24, 13, '#9fd66a', 'left', true);
        let cgOff = 0, hasCar = built && built.parts.length > 0;
        if (hasCar) {
          let mx2 = 0, mm2 = 0;
          built.parts.forEach(pp => { mx2 += pp.lx * pp.def.mass; mm2 += pp.def.mass; });
          cgOff = mx2 / mm2 - built.center.x;
        }
        const rows2 = [
          ['质量', mass.toFixed(1) + ' kg', false],
          ['能量', String(Math.round(energy)), false],
          ['交互键', (built ? built.interactives.length : 0) + ' / ' + RAP.Params.interactCap, false],
          ['零件数', String(built ? built.parts.length : 0), false],
          ['重心偏移', hasCar ? ((cgOff >= 0 ? '+' : '−') + Math.abs(cgOff).toFixed(2) + ' m') : '—', Math.abs(cgOff) > 0.7]
        ];
        rows2.forEach((r, i) => {
          const yy = CY + 54 + i * 27;
          text(r[0], CX + 14, yy, 12, '#8fb6c9', 'left');
          text(r[1], CX + CW - 14, yy, 14, r[2] ? '#ffb4a2' : '#e8f2fa', 'right', true);
        });
      }

      // 重心偏移：让玩家知道"车头偏重 / 整体太高"
      if (built && built.parts.length) {""", "右侧统计卡")

p.write_text(t, encoding="utf-8")
print("done")

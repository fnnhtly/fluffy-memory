"""修两个从完整流程截图里发现的可读性问题：

1) 左侧三个圆钮的标签被裁："清空 C" / "撤销 Z" 文字压在圆钮底边上
   → 底板高度加足，标签往下挪
2) 底部操作提示在草地/岩石上几乎看不见
   → 加一条深色底衬
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) 圆钮底板 + 标签位置 ----------
rep("        roundRect(rect.x - 8, rect.y - 5, rect.w + 16, rect.h + 22, 11); ctx.fill();",
    "        roundRect(rect.x - 10, rect.y - 7, rect.w + 20, rect.h + 34, 12); ctx.fill();",
    "底板加大")

rep("        text(label, c.x, rect.y + rect.h + 16, 11.5, active ? '#e8f4ff' : '#c3d4e2', 'center');",
    "        text(label, c.x, rect.y + rect.h + 20, 12, active ? '#f0f8ff' : '#d4e2ee', 'center', true);",
    "标签下移加粗")

# ---------- 2) 底部操作提示加底衬 ----------
rep("""      text('左键放件 · 拖动可移动 · 右键/R 换方向 · Z 撤销 · C 清空 · 空格出发 · T 调参 · H 零件说明 · L 选关',
        DW / 2, DH - 130, 10.5, 'rgba(200,218,232,.55)', 'center');""",
"""      // 操作提示：加深色底衬，保证在任何地貌上都看得清
      {
        const tipTxt = '左键放件 · 拖动可移动 · 右键/R 换方向 · Z 撤销 · C 清空 · 空格出发 · T 调参 · H 零件说明 · L 选关';
        ctx.font = '10.5px "Microsoft YaHei", sans-serif';
        const tw = ctx.measureText(tipTxt).width;
        ctx.fillStyle = 'rgba(10,18,24,.66)';
        roundRect(DW / 2 - tw / 2 - 12, DH - 142, tw + 24, 20, 10); ctx.fill();
        text(tipTxt, DW / 2, DH - 128, 10.5, 'rgba(214,230,242,.88)', 'center');
      }""", "提示加底衬")

p.write_text(t, encoding="utf-8")
print("done")

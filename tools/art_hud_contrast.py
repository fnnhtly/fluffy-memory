"""亮天空后的 HUD 可读性修复：
1) 顶部信息条从 660 宽加宽到 700，底色加深（0.72 → 0.86）
2) 零件箱/星级那两行文字原本浮在天空上（白字看不见）→ 加一条底衬
3) 关卡页签的未选中态加深
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 顶部信息条
rep("    ctx.fillStyle = COL.panel; roundRect(84, 92, 660, 28, 8); ctx.fill();",
    "    ctx.fillStyle = 'rgba(10,18,24,.88)'; roundRect(84, 90, 700, 30, 8); ctx.fill();",
    "信息条加深加宽")
rep("    text(line, 96, 112, 14, '#dfe9f2');",
    "    text(line, 96, 111, 14, '#eaf4fb');", "信息条文字提亮")

# 2) 零件箱/星级/重心 三行加底衬
rep("""      // ---- 右侧整车统计卡 ----""",
"""      // 三行说明文字底衬（亮天空下必须，否则白字看不见）
      ctx.fillStyle = 'rgba(10,18,24,.62)';
      roundRect(84, 128, 640, 58, 8); ctx.fill();

      // ---- 右侧整车统计卡 ----""", "说明文字底衬")

# 3) 页签未选中态加深
rep("      ctx.fillStyle = active ? '#4a7aa8' : 'rgba(20,26,32,.75)';",
    "      ctx.fillStyle = active ? '#4a7aa8' : 'rgba(12,20,26,.88)';", "页签加深")

p.write_text(t, encoding="utf-8")
print("done")

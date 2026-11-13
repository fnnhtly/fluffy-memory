"""三件事：
1) 底部装饰带（沙滩+海水）压薄，别挡视线
2) 用"零件说明面板"替换"建造 3 步"清单：每个结构是什么、多重、怎么用
3) 左上角暂停 / 重来按钮接上逻辑（暂停冻结物理，重来回到建造并保留零件）
"""
import pathlib

# ---------- 1) 零件说明文本 ----------
g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")

desc = {
    "wood_frame": "中空结构件。四边都能挂东西，中间能塞一件（小猪/电池）。耐久 3 段：完好→裂纹→破损→碎。",
    "wood_wheel": "木轮，便宜。泥地抓地正常，冰面几乎打滑（0.15），冰坡上不去。",
    "iron_wheel": "铁轮，重 0.3 kg。冰面抓地 0.8，是过冰坡的唯一办法。",
    "motor": "持续驱动力（6 m/s²），耗能 4/秒，自带 12 电量；没电池只能跑约 3 秒。",
    "battery": "只能放进木框里。+100 能量，供马达使用。",
    "pump": "手动交互件。按住蓄力、松开喷出冲量；喷气方向 = 组装时箭头的方向。同色同类零件算一组，按一下整组一起喷。",
    "pig": "胜负判定对象。必须放进木框里；木框碎了它会掉出来摔在地上，滚停就算失败。"
}

import re
for part, text in desc.items():
    # 在零件定义行末尾的 `}` 前插入 desc
    pat = re.compile(r"(\n    " + part + r": \{)(.*?)(\},?\n)")
    m = pat.search(s)
    assert m, "part not found: " + part
    body = m.group(2)
    if "desc:" in body:
        continue
    new_body = body + ", desc: '" + text + "'"
    s = s[:m.start(2)] + new_body + s[m.end(2):]

g.write_text(s, encoding="utf-8")
print("game.js: 零件说明已加")

# ---------- 2) 底部装饰带压薄 + 帮助面板 + 暂停/重来 ----------
p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 海面压薄
rep("    const seaY = DH * 0.87;", "    const seaY = DH * 0.935;", "海面下移")
rep("    ctx.fillRect(0, seaY - 16, DW, 16);", "    ctx.fillRect(0, seaY - 9, DW, 9);", "沙滩变薄")

# 状态：帮助面板 / 暂停
rep("    dragPart: null, dragFromTray: false, mouse: { x: 0, y: 0, down: false },",
    "    dragPart: null, dragFromTray: false, mouse: { x: 0, y: 0, down: false },\n    helpOpen: false, paused: false,", "状态位")

# 按钮矩形：帮助 / 暂停 / 重来
rep("      if (name === 'rotate') return { x: 84, y: 460, w: 56, h: 56 };",
    "      if (name === 'rotate') return { x: 84, y: 460, w: 56, h: 56 };\n"
    "      if (name === 'help') return { x: DW / 2 + 150, y: 372, w: 76, h: 44 };", "帮助按钮矩形")

rep("""    if (state.phase === 'run' && state.run) {
      if (name === 'interact') return { x: 0, y: DH - 150, w: 92, h: 92 };""",
"""    if (state.phase === 'run') {
      if (name === 'pause') return { x: 26, y: 86, w: 44, h: 44 };
      if (name === 'restartRun') return { x: 26, y: 138, w: 44, h: 44 };
      if (name === 'help') return { x: DW - 118, y: 86, w: 44, h: 44 };
    }
    if (state.phase === 'run' && state.run) {
      if (name === 'interact') return { x: 0, y: DH - 150, w: 92, h: 92 };""", "暂停/重来矩形")

p.write_text(t, encoding="utf-8")
print("index.html 第一批")

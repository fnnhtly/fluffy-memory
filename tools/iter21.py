"""HUD 加上关卡名 + 目标/零件箱提示（方便试玩时知道这关要干什么）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

old = "    let line = `总重 ${mass.toFixed(1)} kg　能量 ${Math.round(energy)}　交互键 ${built ? built.interactives.length : 0}/${RAP.Params.interactCap}`;"
assert old in t, "hud line not found"
new = "    let line = `${level().levelId} ${level().name}　总重 ${mass.toFixed(1)} kg　能量 ${Math.round(energy)}　交互键 ${built ? built.interactives.length : 0}/${RAP.Params.interactCap}`;"
t = t.replace(old, new)

t = t.replace("    ctx.fillStyle = COL.panel; roundRect(84, 92, 520, 28, 8); ctx.fill();",
              "    ctx.fillStyle = COL.panel; roundRect(84, 92, 660, 28, 8); ctx.fill();")

t = t.replace("    text(line, 96, 112, 14, '#dfe9f2');",
"""    text(line, 96, 112, 14, '#dfe9f2');
    if (state.phase === 'build') {
      const boxParts = Object.keys(level().partsBox || {})
        .map(k => (RAP.PARTS[k] ? RAP.PARTS[k].label : k) + '×' + level().partsBox[k]).join('　');
      text('零件箱：' + (boxParts || '无') + '　　分数：★★ 拿木箱　★★★ ' +
        ({ none: '本关没有', pumpPress: '不按打气筒', energyLeft: '能量剩≥30', noFlip: '不翻车', motorUse: '不用马达' }
          [(level().challenge || {}).type] || (level().challenge || {}).type || '—'),
        96, 148, 12, '#b9cbd8');
    }""")

p.write_text(t, encoding="utf-8")
print("HUD 关卡名 + 零件箱/星级提示")

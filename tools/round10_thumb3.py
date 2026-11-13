"""在卡片里插入缩略图调用，并重排卡片内部布局（给缩略图留位置）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

if "drawLevelThumb(lv," in t:
    print("已存在，跳过")
else:
    old = """      // ★★★ 条件
      const chNames = { none: '无 ★★★', pumpPress: '不按打气筒', energyLeft: '能量剩 ≥ 30',
                        noFlip: '不翻车', motorUse: '不用马达' };
      text('★★★：' + (chNames[(lv.challenge || {}).type] || '—'),
        x + CW / 2, y + 168, 11, '#8fb6c9', 'center');
      // 零件箱
      const boxTxt = Object.keys(lv.partsBox || {})
        .map(k => (RAP.PARTS[k] ? RAP.PARTS[k].label : k) + lv.partsBox[k]).join(' ');
      text(boxTxt, x + CW / 2, y + 202, 10, 'rgba(200,218,232,.55)', 'center');"""
    new = """      // ★★★ 条件
      const chNames = { none: '无 ★★★', pumpPress: '不按打气筒', energyLeft: '能量剩 ≥ 30',
                        noFlip: '不翻车', motorUse: '不用马达' };
      text('★★★：' + (chNames[(lv.challenge || {}).type] || '—'),
        x + CW / 2, y + 166, 11, '#8fb6c9', 'center');
      // 地形缩略图
      drawLevelThumb(lv, x + 12, y + 176, CW - 24, 44);
      // 零件箱
      const boxTxt = Object.keys(lv.partsBox || {})
        .map(k => (RAP.PARTS[k] ? RAP.PARTS[k].label : k) + lv.partsBox[k]).join(' ');
      text(boxTxt, x + CW / 2, y + 236, 10, 'rgba(200,218,232,.55)', 'center');"""
    assert old in t, "卡片布局锚点未找到"
    t = t.replace(old, new)
    print("  ok: 缩略图调用已插入")

p.write_text(t, encoding="utf-8")
print("done")

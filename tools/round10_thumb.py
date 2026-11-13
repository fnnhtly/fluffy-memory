"""第 10 轮 A：选关卡片加地形缩略图（用真实关卡数据画微型剖面线）

每张卡片底部画一条该关的地形轮廓（用 mapRows 算出每列表面对应的高度），
配色沿用该关的 biome，玩家一眼能看出"这关是下坡 / 有沟 / 有冰面"。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 地形缩略图绘制函数（放在 drawLevelSelect 之前）
rep("  function drawLevelSelect() {",
"""  // 关卡地形缩略图：把 mapRows 压成一条 60px 高的剖面
  function drawLevelThumb(lv, x, y, w, h) {
    const rows = lv.mapRows || [];
    const cols = (lv.grid && lv.grid.cols) || rows[0].length;
    // 每列最高实体行
    const top = [];
    for (let c = 0; c < cols; c++) {
      let rr = rows.length;
      for (let r = 0; r < rows.length; r++) {
        const ch = rows[r][c];
        if (ch === '#' || ch === '=' || ch === 'v' || ch === 'n' || ch === '/') { rr = r; break; }
      }
      top.push(rr);
    }
    const maxRow = rows.length;
    const bh = BIOMES[lv.biome] || BIOMES.field;
    // 背景
    ctx.fillStyle = 'rgba(8,14,20,.55)';
    roundRect(x, y, w, h, 5); ctx.fill();
    // 地形多边形
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    for (let c = 0; c < cols; c++) {
      const px = x + (c / (cols - 1)) * w;
      const py = y + h - ((maxRow - top[c]) / maxRow) * h;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fillStyle = 'rgb(' + bh.rock.join(',') + ')';
    ctx.fill();
    // 地表线
    ctx.beginPath();
    for (let c = 0; c < cols; c++) {
      const px = x + (c / (cols - 1)) * w;
      const py = y + h - ((maxRow - top[c]) / maxRow) * h;
      c === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.strokeStyle = bh.grass; ctx.lineWidth = 1.6; ctx.stroke();
    // 起点 / 终点标记
    const sc = (lv.start && lv.start.col) || 0;
    const gc = (lv.goal && lv.goal.col) || cols - 1;
    const sx2 = x + (sc / (cols - 1)) * w;
    const gx2 = x + (gc / (cols - 1)) * w;
    const sy2 = y + h - ((maxRow - top[Math.min(cols - 1, sc)]) / maxRow) * h;
    const gy2 = y + h - ((maxRow - top[Math.min(cols - 1, gc)]) / maxRow) * h;
    ctx.fillStyle = '#63d97e';
    ctx.beginPath(); ctx.arc(sx2, sy2 - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e2574c';
    ctx.beginPath();
    ctx.moveTo(gx2, gy2 - 3); ctx.lineTo(gx2, gy2 - 13); ctx.lineTo(gx2 + 8, gy2 - 9);
    ctx.closePath(); ctx.fill();
    // 框线
    ctx.strokeStyle = 'rgba(232,200,122,.25)'; ctx.lineWidth = 1;
    roundRect(x, y, w, h, 5); ctx.stroke();
  }

  function drawLevelSelect() {""", "地形缩略图函数")

# 2) 卡片里调用（放在零件箱文字之前）
rep("      // 零件箱\n      const boxTxt = Object.keys(lv.partsBox || {})",
"""      // 地形缩略图
      drawLevelThumb(lv, x + 12, y + 138, CW - 24, 44);
      // 零件箱
      const boxTxt = Object.keys(lv.partsBox || {})""", "卡片调用缩略图")

# 3) 卡片高度加大，避免内容挤压
rep("    const CW = 216, CH = 210, GAP = 18;", "    const CW = 216, CH = 250, GAP = 18;", "卡片加高")
rep("    const CW = 216, CH = 210, GAP = 18;\n    const totalW = levels.length * CW + (levels.length - 1) * GAP;\n    return { x: (DW - totalW) / 2 + i * (CW + GAP), y: 168, w: CW, h: CH };",
    "    const CW = 216, CH = 250, GAP = 18;\n    const totalW = levels.length * CW + (levels.length - 1) * GAP;\n    return { x: (DW - totalW) / 2 + i * (CW + GAP), y: 150, w: CW, h: CH };",
    "卡片矩形同步")

p.write_text(t, encoding="utf-8")
print("缩略图完成")

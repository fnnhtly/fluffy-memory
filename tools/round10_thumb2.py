"""补上 drawLevelThumb 函数定义 + 卡片调用（这次分两步验证）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# ---------- 1) 函数定义 ----------
if "function drawLevelThumb" not in t:
    anchor = "  function drawLevelSelect() {"
    assert anchor in t
    fn = '''  // 关卡地形缩略图：把 mapRows 压成一条剖面
  function drawLevelThumb(lv, x, y, w, h) {
    const rows = lv.mapRows || [];
    const cols = (lv.grid && lv.grid.cols) || (rows[0] || '').length;
    if (!cols || !rows.length) return;
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

    ctx.fillStyle = 'rgba(8,14,20,.55)';
    roundRect(x, y, w, h, 5); ctx.fill();

    // 地形剖面
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    for (let c = 0; c < cols; c++) {
      const px = x + (c / Math.max(1, cols - 1)) * w;
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
      const px = x + (c / Math.max(1, cols - 1)) * w;
      const py = y + h - ((maxRow - top[c]) / maxRow) * h;
      c === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.strokeStyle = bh.grass; ctx.lineWidth = 1.6; ctx.stroke();

    // 起点 / 终点
    const sc = Math.max(0, Math.min(cols - 1, (lv.start && lv.start.col) || 0));
    const gc = Math.max(0, Math.min(cols - 1, (lv.goal && lv.goal.col) || cols - 1));
    const sx2 = x + (sc / Math.max(1, cols - 1)) * w;
    const gx2 = x + (gc / Math.max(1, cols - 1)) * w;
    const sy2 = y + h - ((maxRow - top[sc]) / maxRow) * h;
    const gy2 = y + h - ((maxRow - top[gc]) / maxRow) * h;
    ctx.fillStyle = '#63d97e';
    ctx.beginPath(); ctx.arc(sx2, Math.max(y + 3, sy2 - 3), 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e2574c';
    ctx.beginPath();
    ctx.moveTo(gx2, Math.max(y + 3, gy2 - 3));
    ctx.lineTo(gx2, Math.max(y + 3, gy2 - 13));
    ctx.lineTo(gx2 + 8, Math.max(y + 3, gy2 - 9));
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = 'rgba(232,200,122,.25)'; ctx.lineWidth = 1;
    roundRect(x, y, w, h, 5); ctx.stroke();
  }

'''
    t = t.replace(anchor, fn + anchor, 1)
    print("  ok: 函数定义已插入")

# ---------- 2) 卡片内调用 ----------
old_call = "      const boxTxt = Object.keys(lv.partsBox || {})"
if "drawLevelThumb(lv," not in t:
    assert old_call in t
    t = t.replace(old_call,
                  "      // 地形缩略图\n"
                  "      drawLevelThumb(lv, x + 12, y + 140, CW - 24, 46);\n"
                  + old_call, 1)
    print("  ok: 卡片调用已插入")

# ---------- 3) 零件箱文字下移 ----------
t = t.replace("      text(boxTxt, x + CW / 2, y + 190, 10, 'rgba(200,218,232,.55)', 'center');",
              "      text(boxTxt, x + CW / 2, y + 202, 10, 'rgba(200,218,232,.55)', 'center');")
print("  ok: 零件箱下移")

p.write_text(t, encoding="utf-8")
print("done")

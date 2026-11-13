"""方向箭头可读性重做 + 按钮布局整理：
- 箭头从零件中心伸到格子外（1.3 倍），白色包边 + 实心三角箭头 + 尾部喷气短线
- 撤销/换方向按钮挪开，不再压住"出发"文字与网格
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 箭头重画 ----------
start = t.find("  function drawDirArrow(cx, cy, dir, size, color, glow) {")
end = t.find("  function drawPig(cx, cy, r, angle, hurt) {")
assert start > 0 and end > start
new_arrow = '''  function drawDirArrow(cx, cy, dir, size, color, glow) {
    const v = RAP.dirVec(dir);
    const len = size * 0.66;                     // 伸出格子外
    const tailX = cx - v[0] * size * 0.22, tailY = cy + v[1] * size * 0.22;
    const tipX = cx + v[0] * len, tipY = cy - v[1] * len;
    const head = size * 0.26;
    const col = color || '#E8C87A';
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // 尾部喷气短线（表示"从这里喷出去"）
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = glow ? 6 : 5;
    for (const side of [-1, 0, 1]) {
      const px = v[0] === 0 ? side * size * 0.12 : 0;
      const py = v[1] === 0 ? side * size * 0.12 : 0;
      ctx.beginPath();
      ctx.moveTo(tailX - v[0] * size * 0.02 + px, tailY + v[1] * size * 0.02 + py);
      ctx.lineTo(tailX - v[0] * size * 0.16 + px, tailY + v[1] * size * 0.16 + py);
      ctx.stroke();
    }

    // 箭杆：白色包边 + 本体色
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = glow ? 10 : 8;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = glow ? 6 : 4.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();

    // 实心三角箭头
    const ang = Math.atan2(-(tipY - cy), tipX - cx);
    const p1 = [tipX + Math.cos(ang) * head, tipY - Math.sin(ang) * head];
    const p2 = [tipX + Math.cos(ang + 2.5) * head, tipY - Math.sin(ang + 2.5) * head];
    const p3 = [tipX + Math.cos(ang - 2.5) * head, tipY - Math.sin(ang - 2.5) * head];
    ctx.beginPath();
    ctx.moveTo(tipX, tipY); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]);
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

'''
t = t[:start] + new_arrow + t[end:]
print("  ok: 箭头重做")

# ---------- 按钮布局 ----------
rep("      if (name === 'undo') return { x: DW / 2 - 280, y: 274, w: 56, h: 56 };",
    "      if (name === 'undo') return { x: DW / 2 - 240, y: 356, w: 56, h: 56 };", "撤销挪到网格左下内侧")
rep("      if (name === 'rotate') return { x: DW / 2 + 140, y: 344, w: 64, h: 44 };",
    "      if (name === 'rotate') return { x: DW / 2 + 140, y: 366, w: 96, h: 40 };", "换方向挪到出发下方")
rep("      if (name === 'launch') return { x: DW / 2 + 140, y: 270, w: 64, h: 64 };",
    "      if (name === 'launch') return { x: DW / 2 + 140, y: 286, w: 64, h: 64 };", "出发稍微上移")

p.write_text(t, encoding="utf-8")
print("done")

"""A 方案：新手引导 + 按钮重排 + 箭头更清楚（按文件实际内容精确匹配）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) 按钮位置 ----------
rep("      if (name === 'launch') return { x: DW / 2 + 140, y: 286, w: 64, h: 64 };",
    "      if (name === 'launch') return { x: DW / 2 + 150, y: 288, w: 76, h: 76 };", "出发位置")
rep("      if (name === 'clear') return { x: DW / 2 - 204, y: 270, w: 64, h: 64 };",
    "      if (name === 'clear') return { x: 84, y: 292, w: 56, h: 56 };", "清空位置")
rep("      if (name === 'undo') return { x: DW / 2 - 240, y: 356, w: 56, h: 56 };",
    "      if (name === 'undo') return { x: 84, y: 366, w: 56, h: 56 };", "撤销位置")
rep("      if (name === 'rotate') return { x: DW / 2 + 140, y: 366, w: 96, h: 40 };",
    "      if (name === 'rotate') return { x: 84, y: 440, w: 56, h: 56 };", "换方向位置")

# ---------- 2) 按钮绘制整体替换 ----------
S = t.find("      const car = RAP.buildVehicle(level(), state.build);\n      const canGo = !!car;")
E = t.find("    if (state.phase === 'run' && state.run) {", S)
assert S > 0 and E > S, "button block not found"

new_block = '''      const chk = RAP.canLaunch(state.build);
      const LC = { x: L.x + L.w / 2, y: L.y + L.h / 2 };
      const ready = chk.ok;
      // 出发：对勾圆钮（未就绪变灰；就绪时外圈呼吸）
      ctx.fillStyle = ready ? '#4a9be0' : 'rgba(90,104,116,.85)';
      ctx.beginPath(); ctx.arc(LC.x, LC.y, L.w / 2, 0, Math.PI * 2); ctx.fill();
      if (ready) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.22 + 0.33 * pulse).toFixed(3) + ')';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(LC.x, LC.y, L.w / 2 + 6 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(LC.x - 14, LC.y + 1); ctx.lineTo(LC.x - 4, LC.y + 11); ctx.lineTo(LC.x + 15, LC.y - 11);
      ctx.stroke();
      text('出发', LC.x, L.y + L.h + 20, 14, ready ? '#dff0ff' : '#93a3ae', 'center', true);

      // 左侧三个小圆钮（图标 + 下方文字，互不遮挡）
      const knob = (rect, drawIcon, label, active) => {
        const c = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
        ctx.fillStyle = active ? 'rgba(74,123,168,.95)' : 'rgba(24,34,42,.82)';
        ctx.beginPath(); ctx.arc(c.x, c.y, rect.w / 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = active ? 'rgba(255,255,255,.5)' : 'rgba(150,170,185,.35)';
        ctx.lineWidth = 2; ctx.stroke();
        drawIcon(c);
        text(label, c.x, rect.y + rect.h + 16, 11, active ? '#cfe4f5' : '#8fa3b3', 'center');
      };
      knob(C, (c) => {
        ctx.fillStyle = '#dce6ee';
        ctx.fillRect(c.x - 8, c.y - 9, 16, 4);
        ctx.fillRect(c.x - 5, c.y - 12, 10, 4);
        ctx.fillRect(c.x - 7, c.y - 4, 14, 15);
      }, '清空 C', false);
      knob(U, (c) => {
        ctx.strokeStyle = '#dce6ee'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(c.x, c.y, 9, -0.4, 3.9); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(c.x + 9, c.y - 7); ctx.lineTo(c.x + 3, c.y - 12); ctx.lineTo(c.x + 2, c.y - 3);
        ctx.closePath(); ctx.fillStyle = '#dce6ee'; ctx.fill();
      }, '撤销 Z', false);
      const Rr = btnRect('rotate');
      const hc = cellAt(state.mouse.x, state.mouse.y);
      const canRot = !!(hc && state.build.cells[hc.r + ',' + hc.c] &&
        RAP.isDirectional(state.build.cells[hc.r + ',' + hc.c].part));
      knob(Rr, (c) => {
        ctx.strokeStyle = canRot ? '#ffe9b0' : '#dce6ee'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0.6, 5.2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(c.x + 8, c.y - 6); ctx.lineTo(c.x + 12, c.y + 1); ctx.lineTo(c.x + 4, c.y + 1);
        ctx.closePath(); ctx.fillStyle = canRot ? '#ffe9b0' : '#dce6ee'; ctx.fill();
      }, '换方向 R', canRot);
    }

'''
t = t[:S] + new_block + t[E:]
print("  ok: 按钮绘制整体替换")

# ---------- 3) 网格淡一点 ----------
rep("        ctx.fillStyle = ((r + c) % 2 === 0) ? 'rgba(118,148,68,.55)' : 'rgba(98,128,58,.55)';",
    "        ctx.fillStyle = ((r + c) % 2 === 0) ? 'rgba(118,148,68,.38)' : 'rgba(98,128,58,.38)';",
    "网格变淡")

# ---------- 4) 箭头从格子边缘往外 ----------
rep("""    const len = size * 0.98;                     // 明显伸出格子外
    const tailX = cx - v[0] * size * 0.22, tailY = cy + v[1] * size * 0.22;
    const tipX = cx + v[0] * len, tipY = cy - v[1] * len;""",
"""    const len = size * 1.05;                     // 明显伸出格子外
    const startD = size * 0.42;                  // 从格子边缘起，不压住零件
    const sx0 = cx + v[0] * startD, sy0 = cy - v[1] * startD;
    const tailX = sx0 - v[0] * size * 0.1, tailY = sy0 + v[1] * size * 0.1;
    const tipX = cx + v[0] * len, tipY = cy - v[1] * len;""", "箭头起点")
rep("""    ctx.strokeStyle = 'rgba(16,26,20,.85)'; ctx.lineWidth = glow ? 13 : 11;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = glow ? 9 : 7;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = glow ? 6 : 5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();""",
"""    ctx.strokeStyle = 'rgba(16,26,20,.9)'; ctx.lineWidth = glow ? 13 : 11;
    ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = glow ? 9 : 7;
    ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = glow ? 6 : 5;
    ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(tipX, tipY); ctx.stroke();""", "箭头杆起点")

p.write_text(t, encoding="utf-8")
print("done part1")

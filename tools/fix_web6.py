"""UI 密度向参考靠拢：蓝圆钮贴近网格并缩小，零件槽 72→56px（只留数量，不要名字）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 蓝圆钮：贴近网格左右两侧，半径 36→30
t = t.replace("      if (name === 'launch') return { x: DW - 190, y: DH / 2 - 40, w: 120, h: 96 };",
              "      if (name === 'launch') return { x: DW / 2 + 116, y: DH / 2 - 116, w: 64, h: 64 };")
t = t.replace("      if (name === 'clear') return { x: 70, y: DH / 2 - 40, w: 96, h: 80 };",
              "      if (name === 'clear') return { x: DW / 2 - 180, y: DH / 2 - 116, w: 64, h: 64 };")
t = t.replace("      if (name === 'undo') return { x: 40, y: DH / 2 + 52, w: 156, h: 40 };",
              "      if (name === 'undo') return { x: DW / 2 - 250, y: DH / 2 - 116, w: 56, h: 56 };")

# 绘制部分：圆钮半径、图标缩放
t = t.replace("""      const car = RAP.buildVehicle(level(), state.build);
      const canGo = !!car;
      ctx.fillStyle = canGo ? '#4a9be0' : '#5b6670';
      ctx.beginPath(); ctx.arc(L.x + L.w / 2, L.y + L.h / 2, L.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(L.x + 38, L.y + 50); ctx.lineTo(L.x + 54, L.y + 66); ctx.lineTo(L.x + 84, L.y + 30);
      ctx.stroke();
      text('出发', L.x + L.w / 2, L.y + L.h + 22, 14, '#dff0ff', 'center');

      ctx.fillStyle = '#4a9be0';
      ctx.beginPath(); ctx.arc(C.x + C.w / 2, C.y + C.h / 2, C.w / 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(C.x + C.w / 2 - 13, C.y + C.h / 2 - 14, 26, 6);
      ctx.fillRect(C.x + C.w / 2 - 8, C.y + C.h / 2 - 16, 16, 6);
      roundRect(C.x + C.w / 2 - 11, C.y + C.h / 2 - 7, 22, 24, 3); ctx.fill();
      text('清空', C.x + C.w / 2, C.y + C.h + 22, 14, '#dff0ff', 'center');

      ctx.fillStyle = 'rgba(20,26,32,.82)'; roundRect(U.x, U.y, U.w, U.h, 8); ctx.fill();
      text('撤销 Z', U.x + U.w / 2, U.y + 28, 15, '#cfe0ef', 'center');""",
"""      const car = RAP.buildVehicle(level(), state.build);
      const canGo = !!car;
      const LC = { x: L.x + L.w / 2, y: L.y + L.h / 2 };
      ctx.fillStyle = canGo ? '#4a9be0' : '#5b6670';
      ctx.beginPath(); ctx.arc(LC.x, LC.y, L.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(LC.x - 12, LC.y + 1); ctx.lineTo(LC.x - 4, LC.y + 10); ctx.lineTo(LC.x + 13, LC.y - 10);
      ctx.stroke();
      text('出发', LC.x, L.y + L.h + 18, 13, '#dff0ff', 'center');

      const CC = { x: C.x + C.w / 2, y: C.y + C.h / 2 };
      ctx.fillStyle = '#4a9be0';
      ctx.beginPath(); ctx.arc(CC.x, CC.y, C.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(CC.x - 10, CC.y - 12, 20, 5);
      ctx.fillRect(CC.x - 6, CC.y - 14, 12, 5);
      roundRect(CC.x - 8, CC.y - 6, 16, 19, 2); ctx.fill();
      text('清空', CC.x, C.y + C.h + 18, 13, '#dff0ff', 'center');

      ctx.fillStyle = 'rgba(20,26,32,.82)'; roundRect(U.x, U.y, U.w, U.h, 10); ctx.fill();
      ctx.strokeStyle = '#cfe0ef'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(U.x + 26, U.y + 20); ctx.lineTo(U.x + 14, U.y + 30); ctx.lineTo(U.x + 26, U.y + 40);
      ctx.stroke();""")

# 零件槽 72→56，间距 10→8，只留数量
t = t.replace("  function trayRect(i) {\n    const n = TRAY.length, w = 72, gap = 10;",
              "  function trayRect(i) {\n    const n = TRAY.length, w = 56, gap = 8;")
t = t.replace("    return { x: x0 + i * (w + gap), y: DH - 118, w, h: w };",
              "    return { x: x0 + i * (w + gap), y: DH - 92, w, h: w };")
t = t.replace("""      text((part === 'eraser' ? '' : (left > 0 ? 'x' + left : 'x0')),
        rect.x + rect.w - 6, rect.y + 14, 12, left > 0 || part === 'eraser' ? '#e8f0e0' : '#ff9c86', 'right');
      text(RAP.PARTS[part] ? RAP.PARTS[part].label : '橡皮',
        rect.x + rect.w / 2, rect.y + rect.h + 15, 12, '#dfe9f2', 'center');""",
"""      text(part === 'eraser' ? '' : String(left),
        rect.x + rect.w / 2, rect.y + rect.h + 16, 13,
        left > 0 || part === 'eraser' ? '#ffffff' : '#ff9c86', 'center');""")

p.write_text(t, encoding="utf-8")
print("index.html: UI 密度调整完成")

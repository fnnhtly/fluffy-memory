"""补上 drawHelp 函数定义（之前那次脚本没写盘），并移除"建造 3 步"清单。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 1) 定义 drawHelp（插在 drawToast 之前）
assert "function drawHelp" not in t
help_fn = '''  function drawHelp() {
    if (!state.helpOpen) return;
    const W = 920, H = 540, X = (DW - W) / 2, Y = 84;
    ctx.fillStyle = 'rgba(6,12,14,.78)'; ctx.fillRect(0, 0, DW, DH);
    ctx.fillStyle = '#132430'; roundRect(X, Y, W, H, 16); ctx.fill();
    ctx.strokeStyle = 'rgba(232,200,122,.55)'; ctx.lineWidth = 2; ctx.stroke();
    text('零件说明 —— 搭之前先知道每个东西干什么', X + 26, Y + 40, 19, '#ffe9b0', 'left', true);

    const order = RAP.TRAY_ORDER;
    order.forEach((part, i) => {
      const def = RAP.PARTS[part];
      const yy = Y + 84 + i * 62;
      drawPartShape(part, X + 58, yy + 6, 36, 0);
      text(def.label, X + 92, yy, 15, '#e6f0f8', 'left', true);
      const tags = [def.mass + ' kg'];
      if (def.structure) tags.push('结构');
      if (def.wheel) tags.push('轮子');
      if (def.motor) tags.push('动力');
      if (def.energy) tags.push('能量 +' + def.energy);
      if (def.interactive) tags.push('交互件');
      if (def.inner) tags.push('只能放框里');
      if (def.dir) tags.push('有方向');
      text(tags.join(' · '), X + 92, yy + 18, 11, '#8fb6c9', 'left');
      // 说明文字自动换行
      const chars = (def.desc || '').split('');
      let line = '', ly = yy + 2, lx = X + 236;
      for (let k = 0; k < chars.length; k++) {
        const test = line + chars[k];
        if (ctx.measureText(test).width > X + W - 30 - lx) {
          text(line, lx, ly, 13, '#cfe0ee', 'left');
          line = chars[k]; ly += 19;
        } else line = test;
      }
      if (line) text(line, lx, ly, 13, '#cfe0ee', 'left');
    });
    text('按 H 或点「? 零件说明」关闭', X + W - 26, Y + H - 18, 12, '#7f97a6', 'right');
  }

'''
t = t.replace("  function drawToast() {", help_fn + "  function drawToast() {")
print("  ok: drawHelp 定义")

# 2) 移除 3 步清单
start = t.find("      // ---- 3 步新手引导 ----")
end = t.find('      // 重心偏移：让玩家知道"车头偏重 / 整体太高"')
if start > 0 and end > start:
    t = t[:start] + t[end:]
    print("  ok: 移除 3 步清单")
else:
    print("  !! 3 步清单未找到")

p.write_text(t, encoding="utf-8")
print("done")

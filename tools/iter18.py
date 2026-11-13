"""渲染方向箭头 + 旋转按钮 + 提示。
- 建造界面：每个方向件从格心画一支金色箭头（朝向 = dir），悬停/选中时更亮更大
- 行驶界面：也画浅色箭头，让玩家知道推进方向
- 新增"旋转"按钮（↻），作用在光标所在的格子；没有悬停格子就转最后放下的方向件
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# ---------- 1) 方向箭头绘制函数 ----------
t = t.replace("  function drawPig(cx, cy, r, angle, hurt) {",
"""  // 画"喷气/推进方向"箭头：从格心朝 dir 方向
  function drawDirArrow(cx, cy, dir, size, color, glow) {
    const v = RAP.dirVec(dir);
    const len = size * 0.52;
    const x2 = cx + v[0] * len, y2 = cy - v[1] * len;
    ctx.save();
    ctx.lineCap = 'round';
    if (glow) {
      ctx.strokeStyle = 'rgba(232,200,122,.35)'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.strokeStyle = color || '#E8C87A'; ctx.lineWidth = glow ? 4 : 3;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x2, y2); ctx.stroke();
    // 箭头头（两根短线）
    const ang = Math.atan2(-(y2 - cy), x2 - cx);
    const head = size * 0.20;
    for (const d of [2.5, -2.5]) {
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(ang + d), y2 + head * Math.sin(ang + d));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPig(cx, cy, r, angle, hurt) {""")

# ---------- 2) 建造界面画箭头 ----------
t = t.replace("""    // 再画框里的内嵌件（小猪），放在框的内壁之上""",
"""    // 方向件：画箭头（组装时最重要的信息）
    const hover = cellAt(state.mouse.x, state.mouse.y);
    keys.forEach(k => {
      const cell = state.build.cells[k];
      if (!RAP.isDirectional(cell.part)) return;
      const p = at(k);
      const isHover = hover && hover.r === +k.split(',')[0] && hover.c === +k.split(',')[1];
      drawDirArrow(p.x, p.y, cell.dir || 0, BUILD_PX, isHover ? '#FFF3C4' : '#E8C87A', isHover);
    });

    // 再画框里的内嵌件（小猪），放在框的内壁之上""")

# ---------- 3) 行驶界面画箭头 ----------
t = t.replace("""    // 接触阴影（立体感第二步：物体与地面的关系）""",
"""    // 推进方向箭头（行驶时淡一点，别抢戏）
    ordered_parts_for_arrows(car).forEach(p => {
      const wx = car.x + p.lx * ca - p.ly * sa;
      const wy = car.y + p.lx * sa + p.ly * ca;
      const s = worldToScreen(wx, wy, cam);
      drawDirArrow(s.x, s.y, (p.dir || 0) + Math.round((car.a * 180 / Math.PI) / 90), PPM * cam.zoom * 0.9, 'rgba(232,200,122,.7)', false);
    });

    // 接触阴影（立体感第二步：物体与地面的关系）""")
t = t.replace("""  function drawRun(elapsed) {""",
"""  function ordered_parts_for_arrows(car) {
    return car.parts.filter(p => RAP.isDirectional(p.part) && !p.inner);
  }

  function drawRun(elapsed) {""")

# ---------- 4) 旋转按钮 ----------
t = t.replace("      if (name === 'undo') return { x: DW / 2 - 280, y: 274, w: 56, h: 56 };",
              "      if (name === 'undo') return { x: DW / 2 - 280, y: 274, w: 56, h: 56 };\n"
              "      if (name === 'rotate') return { x: DW / 2 + 140, y: 344, w: 64, h: 44 };")
t = t.replace("""      ctx.fillStyle = 'rgba(20,26,32,.82)'; roundRect(U.x, U.y, U.w, U.h, 10); ctx.fill();""",
"""      const Rr = btnRect('rotate');
      const hc = cellAt(state.mouse.x, state.mouse.y);
      const canRot = !!(hc && state.build.cells[hc.r + ',' + hc.c] && RAP.isDirectional(state.build.cells[hc.r + ',' + hc.c].part));
      ctx.fillStyle = canRot ? '#4a7aa8' : 'rgba(20,26,32,.55)';
      roundRect(Rr.x, Rr.y, Rr.w, Rr.h, 8); ctx.fill();
      text('↻ 换方向', Rr.x + Rr.w / 2, Rr.y + 27, 13, canRot ? '#ffffff' : '#7f8c99', 'center');

      ctx.fillStyle = 'rgba(20,26,32,.82)'; roundRect(U.x, U.y, U.w, U.h, 10); ctx.fill();""")

# 点击处理：旋转按钮
t = t.replace("      if (hit(bUndo, p.x, p.y)) { RAP.undo(state.build); return; }",
"""      if (hit(bUndo, p.x, p.y)) { RAP.undo(state.build); return; }
      const bRot = btnRect('rotate');
      if (hit(bRot, p.x, p.y)) {
        const hc2 = cellAt(p.x, p.y) || cellAt(state.mouse.x, state.mouse.y);
        if (hc2 && state.build.cells[hc2.r + ',' + hc2.c] &&
            RAP.isDirectional(state.build.cells[hc2.r + ',' + hc2.c].part)) {
          RAP.rotateAt(state.build, hc2.r, hc2.c);
          SFX.place();
        } else {
          // 没有悬停格子：转最后放下的方向件
          const keys = state.build.order.slice().reverse();
          for (const k of keys) {
            if (k.indexOf('inner:') === 0) continue;
            const cell = state.build.cells[k];
            if (cell && RAP.isDirectional(cell.part)) {
              RAP.rotateAt(state.build, +k.split(',')[0], +k.split(',')[1]);
              SFX.place();
              break;
            }
          }
        }
        return;
      }""")

# 提示文案
t = t.replace("左键拖/点放零件 · 右键旋转 · Z 撤销 · C 清空 · 空格发射 · 1/2/3 交互键 · T 调参",
              "左键拖/点放零件 · 方向件：右键 / R / 再点一次换方向 · Z 撤销 · C 清空 · 空格发射 · 1/2/3 交互键 · T 调参")

p.write_text(t, encoding="utf-8")
print("index.html: 方向箭头 + 旋转按钮 + 提示")

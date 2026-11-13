"""修文字重叠 + 建造手感（第 2 项）：
1) 建造台标签从网格顶部挪进网格内左上角
2) 拖拽吸附：光标周围显示可放/不可放的格子高亮（绿=可放，红=不可放）
3) 放错位置：零件从光标"弹回"零件槽（0.25s 补间）
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) 建造台标签挪位 ----------
rep("    text('建造台 6×8', o.x - padX + 12, o.y + 16, 11, 'rgba(255,233,176,.75)', 'left', true);",
    "    text('6 × 8', o.x + RAP.BUILD_COLS * BUILD_PX - 8, o.y + RAP.BUILD_ROWS * BUILD_PX + 2,\n"
    "      11, 'rgba(255,233,176,.5)', 'right', true);", "建造台标签挪进网格")

# ---------- 2) 拖拽吸附高亮 ----------
rep("""    // 悬停高亮 + 幽灵零件
    const cell = cellAt(state.mouse.x, state.mouse.y);""",
"""    // 拖拽吸附：按住拖动时，光标能落到的格子亮绿（能放）/ 亮红（放不下）
    if (state.mouse.down && (state.dragPart || state.selected !== 'eraser')) {
      const want = state.dragMove ? state.dragMove.part : (state.dragPart || state.selected);
      const cell = cellAt(state.mouse.x, state.mouse.y);
      if (cell && want && want !== 'eraser') {
        let okHere = true;
        if (state.dragMove) okHere = !state.build.cells[cell.r + ',' + cell.c] ||
          (cell.r === state.dragMove.r && cell.c === state.dragMove.c);
        else {
          const probe = RAP.tryPlace(level(), state.build, want, cell.r, cell.c);
          okHere = probe.ok;
          // tryPlace 可能真的写进去了，撤回（这次只是探测）
          if (probe.ok && !probe.rotated) {
            const kk = cell.r + ',' + cell.c;
            if (state.build.cells[kk] && state.build.cells[kk].part === want) {
              if (state.build.cells[kk].inner) state.build.cells[kk].inner = null;
              else delete state.build.cells[kk];
              const oi = state.build.order.lastIndexOf('inner:' + kk);
              if (oi >= 0) state.build.order.splice(oi, 1);
              const oj = state.build.order.lastIndexOf(kk);
              if (oj >= 0) state.build.order.splice(oj, 1);
            }
          }
        }
        const cx0 = o.x + cell.c * BUILD_PX, cy0 = o.y + cell.r * BUILD_PX;
        ctx.fillStyle = okHere ? 'rgba(99,217,126,.28)' : 'rgba(224,81,60,.28)';
        roundRect(cx0 + 2, cy0 + 2, BUILD_PX - 4, BUILD_PX - 4, 6); ctx.fill();
        ctx.strokeStyle = okHere ? 'rgba(150,240,170,.9)' : 'rgba(255,150,130,.9)';
        ctx.lineWidth = 2.5;
        roundRect(cx0 + 2, cy0 + 2, BUILD_PX - 4, BUILD_PX - 4, 6); ctx.stroke();
      }
    }

    // 悬停高亮 + 幽灵零件
    const cell = cellAt(state.mouse.x, state.mouse.y);""", "吸附高亮")

# ---------- 3) 放错弹回动画 ----------
rep("    helpOpen: false, paused: false,",
    "    helpOpen: false, paused: false, bounce: null,", "bounce 状态")

# 放不进去时记录弹回起点
rep("""      if (!placed) {
        // 放不进去 → 放回原处""",
"""      if (!placed) {
        // 放不进去 → 放回原处（并播放弹回动画）
        state.bounce = { x: p.x, y: p.y, t: 0, part: mv.part };""", "记录弹回")

# 弹回动画绘制（在 drawGrid 之后、drawBuildCar 之前由 frame 调用）
rep("      drawBuildCar();",
"""      drawBuildCar();
      if (state.bounce) {
        state.bounce.t += dt;
        const k = Math.min(1, state.bounce.t / 0.25);
        if (k >= 1) { state.bounce = null; }
        else {
          const idx = TRAY.indexOf(state.bounce.part);
          const target = idx >= 0 ? trayRect(idx) : { x: DW / 2, y: DH - 60, w: 0, h: 0 };
          const tx = target.x + target.w / 2, ty = target.y + target.h / 2;
          const bx = state.bounce.x + (tx - state.bounce.x) * k;
          const by = state.bounce.y + (ty - state.bounce.y) * k;
          ctx.save();
          ctx.globalAlpha = 1 - k * 0.7;
          drawPartShape(state.bounce.part, bx, by, BUILD_PX * 0.84 * (1 - k * 0.3), 0);
          ctx.restore();
        }
      }""", "弹回动画绘制")

p.write_text(t, encoding="utf-8")
print("done")

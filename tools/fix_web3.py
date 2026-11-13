"""修建造交互：改成"按下拿起零件（跟随光标画幽灵）→ 松手落子"。

现在的问题：从零件槽往格子拖时，mousemove 经过的格子会先被依次放上零件
（实测第一块木框落到了 5,0，而不是目标 4,1），组出来的车不是玩家想要的。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# ---------- mousedown：建造阶段不再立即落子 ----------
old_down = """      for (let i = 0; i < TRAY.length; i++) {
        if (hit(trayRect(i), p.x, p.y)) {
          if (ev.button === 2) return;
          selectPart(TRAY[i]);
          state.dragFromTray = true;
          state.dragPart = TRAY[i] === 'eraser' ? 'eraser' : TRAY[i];
          return;
        }
      }
      const cell = cellAt(p.x, p.y);
      if (cell) {
        if (ev.button === 2) { RAP.rotateAt(state.build, cell.r, cell.c); return; }
        tryPlaceAt(cell.r, cell.c);
        state.dragPart = state.selected;
        state.dragFromTray = false;
      }
      return;"""
new_down = """      for (let i = 0; i < TRAY.length; i++) {
        if (hit(trayRect(i), p.x, p.y)) {
          if (ev.button === 2) return;
          selectPart(TRAY[i]);
          state.dragPart = TRAY[i];       // 拿起零件，等松手才落子
          state.dragFromTray = true;
          return;
        }
      }
      const cell = cellAt(p.x, p.y);
      if (cell) {
        if (ev.button === 2) { RAP.rotateAt(state.build, cell.r, cell.c); return; }
        state.dragPart = state.selected;  // 点在格子上：同样等松手再放
        state.dragFromTray = false;
      }
      return;"""
assert old_down in t
t = t.replace(old_down, new_down)

# ---------- mousemove：只更新幽灵位置，不落子 ----------
old_move = """    if (state.phase === 'build' && state.mouse.down) {
      const cell = cellAt(p.x, p.y);
      if (cell && state.dragPart) {
        // 拖拽连续放置（同一格只放一次）
        const key = cell.r + ',' + cell.c;
        if (state.lastDragCell !== key) {
          state.lastDragCell = key;
          const prev = state.selected;
          state.selected = state.dragPart;
          tryPlaceAt(cell.r, cell.c);
          state.selected = prev;
        }
      }
    }"""
new_move = """    // 建造阶段：按住时只跟随光标画幽灵，落子在 mouseup"""
assert old_move in t
t = t.replace(old_move, new_move)

# ---------- mouseup：松手落子 ----------
old_up = """  cv.addEventListener('mouseup', ev => {
    const p = canvasPos(ev);
    state.mouse.down = false;
    state.lastDragCell = null;"""
new_up = """  cv.addEventListener('mouseup', ev => {
    const p = canvasPos(ev);
    state.mouse.down = false;
    state.lastDragCell = null;
    if (state.phase === 'build' && state.dragPart) {
      const cell = cellAt(p.x, p.y);
      if (cell) {
        const want = state.dragPart === 'eraser' ? 'eraser' : state.dragPart;
        const prev = state.selected;
        state.selected = want;
        tryPlaceAt(cell.r, cell.c);
        state.selected = (want === 'eraser') ? prev : want;
      }
      state.dragPart = null;
      state.dragFromTray = false;
      return;
    }"""
assert old_up in t
t = t.replace(old_up, new_up)

# ---------- 幽灵渲染 ----------
old_grid_end = """    // 悬停高亮
    const cell = cellAt(state.mouse.x, state.mouse.y);
    if (cell) {
      ctx.strokeStyle = 'rgba(255,235,140,.95)'; ctx.lineWidth = 3;
      roundRect(o.x + cell.c * PPM + 2, o.y + cell.r * PPM + 2, PPM - 4, PPM - 4, 5); ctx.stroke();
    }
  }"""
new_grid_end = """    // 悬停高亮 + 幽灵零件
    const cell = cellAt(state.mouse.x, state.mouse.y);
    if (cell) {
      ctx.strokeStyle = 'rgba(255,235,140,.95)'; ctx.lineWidth = 3;
      roundRect(o.x + cell.c * PPM + 2, o.y + cell.r * PPM + 2, PPM - 4, PPM - 4, 5); ctx.stroke();
    }
    const ghost = state.dragPart || (state.selected !== 'eraser' ? state.selected : null);
    if (ghost && state.mouse.down) {
      ctx.globalAlpha = 0.55;
      drawPartShape(ghost, state.mouse.x, state.mouse.y, PPM * 0.8, 0);
      ctx.globalAlpha = 1;
    }
  }"""
assert old_grid_end in t
t = t.replace(old_grid_end, new_grid_end)

p.write_text(t, encoding="utf-8")
print("index.html: 拖拽改为松手落子 + 幽灵预览")

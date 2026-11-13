"""点击 vs 拖拽分流（解决"选着猪去拖框 → 变成放猪"的冲突）：
- 按下有零件的格子：先不改变任何东西，记录 pendingClick
- 移动超过 8px → 才真正"拿起来移动"
- 松手没移动 → 当作一次点击：能放当前选中的零件就放，否则是方向件就旋转
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# mousedown：不再立刻拿起，改为 recording
rep("""        const key = cell.r + ',' + cell.c;
        const there = state.build.cells[key];
        const selDef = RAP.PARTS[state.selected];
        const wantInner = !!(selDef && selDef.inner);
        // 选的是内嵌件（猪/电池）+ 目标格是木框 → 放进去，而不是把框拿起来
        if (there && !(wantInner && RAP.PARTS[there.part].structure)) {
          // 拿起已经放好的零件（移动），而不是从仓库新建一个同类
          state.dragMove = { r: cell.r, c: cell.c, part: there.part, dir: there.dir || 0, inner: there.inner || null };
          delete state.build.cells[key];
          let idx = state.build.order.indexOf(key);
          if (idx >= 0) state.build.order.splice(idx, 1);
          if (there.inner) {
            const ii = state.build.order.indexOf('inner:' + key);
            if (ii >= 0) state.build.order.splice(ii, 1);
          }
          state.dragPart = state.dragMove.inner ? state.dragMove.inner : there.part;
          state.dragFromTray = false;
          return;
        }
        state.dragPart = state.selected;   // 空格子：放当前选中的零件
        state.dragFromTray = false;
      }
      return;""",
"""        const key = cell.r + ',' + cell.c;
        const there = state.build.cells[key];
        if (there) {
          // 先只记录：拖动才移动，单击则按选中零件去放置/旋转
          state.pendingClick = { r: cell.r, c: cell.c, x: p.x, y: p.y, moved: false };
          return;
        }
        state.dragPart = state.selected;   // 空格子：放当前选中的零件
        state.dragFromTray = false;
      }
      return;""", "按下改为 pendingClick")

# mousemove：超过阈值才拿起
rep("""  cv.addEventListener('mousemove', ev => {
    const p = canvasPos(ev);
    state.mouse.x = p.x; state.mouse.y = p.y;
    // 建造阶段：按住时只跟随光标画幽灵，落子在 mouseup""",
"""  cv.addEventListener('mousemove', ev => {
    const p = canvasPos(ev);
    state.mouse.x = p.x; state.mouse.y = p.y;
    // 按住已放零件并移动超过 8px → 才拿起它（单击不算移动）
    if (state.phase === 'build' && state.pendingClick && !state.dragMove) {
      const pc = state.pendingClick;
      if (Math.hypot(p.x - pc.x, p.y - pc.y) > 8) {
        const key = pc.r + ',' + pc.c;
        const there = state.build.cells[key];
        if (there) {
          state.dragMove = { r: pc.r, c: pc.c, part: there.part, dir: there.dir || 0, inner: there.inner || null };
          delete state.build.cells[key];
          let idx = state.build.order.indexOf(key);
          if (idx >= 0) state.build.order.splice(idx, 1);
          if (there.inner) {
            const ii = state.build.order.indexOf('inner:' + key);
            if (ii >= 0) state.build.order.splice(ii, 1);
          }
          state.dragPart = state.dragMove.inner || there.part;
          state.dragFromTray = false;
        }
        state.pendingClick = null;
      }
    }
    // 建造阶段：按住时只跟随光标画幽灵，落子在 mouseup""", "拖动阈值 8px")

# mouseup：先处理 pendingClick（单击语义）
rep("""    if (state.phase === 'build' && state.dragMove) {""",
"""    if (state.phase === 'build' && state.pendingClick) {
      const pc = state.pendingClick;
      state.pendingClick = null;
      const key = pc.r + ',' + pc.c;
      const there = state.build.cells[key];
      if (there) {
        // 单击已放的格子：优先"把选中的零件放进/放到这里"，其次"旋转方向件"
        const prevSel = state.selected;
        const res = RAP.tryPlace(level(), state.build, prevSel, pc.r, pc.c);
        if (res.ok) {
          if (res.rotated) SFX.place();
          else SFX.place();
        } else if (RAP.isDirectional(there.part) && prevSel === there.part) {
          RAP.rotateAt(state.build, pc.r, pc.c);
        }
      }
      return;
    }
    if (state.phase === 'build' && state.dragMove) {""", "单击语义")

p.write_text(t, encoding="utf-8")
print("click/drag 分流完成")

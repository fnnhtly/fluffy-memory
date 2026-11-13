"""渲染层两处探测改用 canPlace（不再修改建造数据）。

这是"打气筒左键长按一直旋转"的根因修复：
tryPlace 对已放的方向件会 dir+1，而渲染层每帧调它 → 每帧转一次。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) 吸附高亮（拖拽时）----------
rep("""        else {
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
        }""",
"""        else {
          // 纯检查，不改数据（用 tryPlace 会每帧推进方向，导致"一直旋转"）
          okHere = RAP.canPlace(level(), state.build, want, cell.r, cell.c).ok;
        }""", "吸附高亮改 canPlace")

# ---------- 2) 悬停红叉预览 ----------
rep("""    if (cell && !state.build.cells[cell.r + ',' + cell.c] && state.selected !== 'eraser') {
      const probe = RAP.tryPlace(level(), state.build, state.selected, cell.r, cell.c);
      if (probe.ok && !probe.rotated) {
        const kk = cell.r + ',' + cell.c;
        if (state.build.cells[kk] && state.build.cells[kk].part === state.selected) {
          if (state.build.cells[kk].inner) state.build.cells[kk].inner = null;
          else delete state.build.cells[kk];
          const oi = state.build.order.lastIndexOf('inner:' + kk);
          if (oi >= 0) state.build.order.splice(oi, 1);
          const oj = state.build.order.lastIndexOf(kk);
          if (oj >= 0) state.build.order.splice(oj, 1);
        }
      } else if (!probe.ok) {""",
"""    if (cell && !state.build.cells[cell.r + ',' + cell.c] && state.selected !== 'eraser') {
      // 纯检查，不改数据
      const probe = RAP.canPlace(level(), state.build, state.selected, cell.r, cell.c);
      if (!probe.ok) {""", "红叉预览改 canPlace")

p.write_text(t, encoding="utf-8")
print("done")

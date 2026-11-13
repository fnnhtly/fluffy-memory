"""橡皮真正生效：
1) 选中橡皮时，按下即擦 + 拖动连续擦（不进入"拿起零件移动"的分支）
2) 单击语义里补上橡皮分支（removeAt）
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 按下网格：橡皮优先擦除，且不进入拿起/放置
rep("""      const cell = cellAt(p.x, p.y);
      if (cell) {
        if (ev.button === 2) { RAP.rotateAt(state.build, cell.r, cell.c); return; }
        const key = cell.r + ',' + cell.c;""",
"""      const cell = cellAt(p.x, p.y);
      if (cell) {
        if (ev.button === 2) { RAP.rotateAt(state.build, cell.r, cell.c); return; }
        // 橡皮：按下即擦，按住拖动可以连续擦
        if (state.selected === 'eraser') {
          state.erasePaint = true;
          if (RAP.removeAt(state.build, cell.r, cell.c)) SFX.place();
          return;
        }
        const key = cell.r + ',' + cell.c;""", "橡皮按下即擦")

# 2) 拖动连续擦（放在 mousemove 最前面）
rep("""  cv.addEventListener('mousemove', ev => {
    const p = canvasPos(ev);
    state.mouse.x = p.x; state.mouse.y = p.y;""",
"""  cv.addEventListener('mousemove', ev => {
    const p = canvasPos(ev);
    state.mouse.x = p.x; state.mouse.y = p.y;
    // 橡皮按住拖动 = 连续擦
    if (state.phase === 'build' && state.erasePaint && state.mouse.down) {
      const c0 = cellAt(p.x, p.y);
      if (c0) {
        const kk = c0.r + ',' + c0.c;
        if (state.build.cells[kk]) RAP.removeAt(state.build, c0.r, c0.c);
      }
    }""", "橡皮连续擦")

# 3) 松手清 flag
rep("""    state.mouse.down = false;
    state.lastDragCell = null;""",
"""    state.mouse.down = false;
    state.erasePaint = false;
    state.lastDragCell = null;""", "松手清除橡皮状态")

# 4) 单击语义补橡皮分支
rep("""      if (there) {
        // 单击已放的格子：优先"把选中的零件放进/放到这里"，其次"旋转方向件"
        const prevSel = state.selected;""",
"""      if (there) {
        // 橡皮：单击删除
        if (state.selected === 'eraser') {
          RAP.removeAt(state.build, pc.r, pc.c);
          SFX.place();
          return;
        }
        // 单击已放的格子：优先"把选中的零件放进/放到这里"，其次"旋转方向件"
        const prevSel = state.selected;""", "单击橡皮")

# 5) 橡皮选中时悬停格子画红色高亮
rep("""    // 悬停高亮 + 幽灵零件
    const cell = cellAt(state.mouse.x, state.mouse.y);
    if (cell) {
      ctx.strokeStyle = 'rgba(255,235,140,.95)'; ctx.lineWidth = 3;""",
"""    // 悬停高亮 + 幽灵零件
    const cell = cellAt(state.mouse.x, state.mouse.y);
    if (cell) {
      if (state.selected === 'eraser') {
        ctx.fillStyle = 'rgba(224,81,60,.28)';
        roundRect(o.x + cell.c * BUILD_PX + 2, o.y + cell.r * BUILD_PX + 2, BUILD_PX - 4, BUILD_PX - 4, 6);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,235,140,.95)'; ctx.lineWidth = 3;""", "橡皮红色高亮")

p.write_text(t, encoding="utf-8")
print("done")

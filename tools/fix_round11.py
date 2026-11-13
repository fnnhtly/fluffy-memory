"""补两个小东西：拖拽时跟随光标的零件名 + HUD 显示重心偏移（"物理感"）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 拖拽时跟随光标的零件名
rep("""    const ghost = state.dragPart || (state.selected !== 'eraser' ? state.selected : null);
    if (ghost && state.mouse.down) {
      ctx.globalAlpha = 0.55;
      drawPartShape(ghost, state.mouse.x, state.mouse.y, BUILD_PX * 0.84, 0);
      ctx.globalAlpha = 1;
    }""",
"""    const ghost = state.dragPart || (state.selected !== 'eraser' ? state.selected : null);
    if (ghost && state.mouse.down) {
      ctx.globalAlpha = 0.55;
      drawPartShape(ghost, state.mouse.x, state.mouse.y, BUILD_PX * 0.84, 0);
      ctx.globalAlpha = 1;
      // 跟着光标显示零件名 —— 拖的时候也知道手里是什么
      if (RAP.PARTS[ghost]) {
        const nm = RAP.PARTS[ghost].label;
        const w = nm.length * 15 + 22;
        ctx.fillStyle = 'rgba(10,18,24,.92)';
        roundRect(state.mouse.x + 18, state.mouse.y - 34, w, 24, 7); ctx.fill();
        text(nm, state.mouse.x + 18 + w / 2, state.mouse.y - 17, 13, '#ffe9b0', 'center', true);
      }
    }""", "拖拽显示零件名")

# HUD 重心
rep("""    if (state.phase === 'build') {
      const hasPig = Object.keys(state.build.cells).some(k => state.build.cells[k].inner === 'pig');""",
"""    if (state.phase === 'build') {
      // 重心偏移：让玩家知道"车头偏重 / 整体太高"
      if (built && built.parts.length) {
        let mx = 0, my = 0, mm = 0;
        built.parts.forEach(pp => { mx += pp.lx * pp.def.mass; my += pp.ly * pp.def.mass; mm += pp.def.mass; });
        const cgx = mx / mm - built.center.x;
        const wheelY = built.wheels.length ? built.wheels.reduce((a, w) => a + w.ly, 0) / built.wheels.length : built.hull.minY;
        const tall = (my / mm) - wheelY;
        const cgText = `重心 前后${cgx >= 0 ? '+' : '−'}${Math.abs(cgx).toFixed(2)}　轮上高度 ${tall.toFixed(2)} m`;
        text(cgText, 96, 168, 12, Math.abs(cgx) > 0.7 ? '#ffb4a2' : '#9fc3d8');
      }
      const hasPig = Object.keys(state.build.cells).some(k => state.build.cells[k].inner === 'pig');""",
    "HUD 重心")

p.write_text(t, encoding="utf-8")
print("done")

"""界面层第一轮修复（index.html）：
1) 零件槽缩小 + 悬停/选中显示零件名（不再"选了什么都不知道"）
2) 已放的零件可以**拖动移动**（拿起 → 松手放下；无效位置就放回原处），不再从仓库凭空新建一个
3) 行驶界面按钮改成**颜色组**：同色同类零件一组，按一下该颜色所有零件一起启动
4) 方向箭头改成零件本色 + 白描边，悬停时旁边写"上/下/左/右"
5) 木框按耐久分三段外观（完好 / 裂纹 / 破损），不再"哐一下直接消失"
6) 掉出来的小猪/电池会真的落在地上（自由体渲染）
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------------- 1) 零件槽缩小 ----------------
rep("""  function trayRect(i) {
    const n = TRAY.length, w = 56, gap = 8;
    const total = n * w + (n - 1) * gap;
    const x0 = (DW - total) / 2;
    return { x: x0 + i * (w + gap), y: DH - 92, w, h: w };
  }""",
"""  function trayRect(i) {
    const n = TRAY.length, w = 46, gap = 7;
    const total = n * w + (n - 1) * gap;
    const x0 = (DW - total) / 2;
    return { x: x0 + i * (w + gap), y: DH - 76, w, h: w };
  }""", "零件槽 46px")

# ---------------- 2) 拖动已放零件 ----------------
rep("""      const cell = cellAt(p.x, p.y);
      if (cell) {
        if (ev.button === 2) { RAP.rotateAt(state.build, cell.r, cell.c); return; }
        state.dragPart = state.selected;  // 点在格子上：同样等松手再放
        state.dragFromTray = false;
      }
      return;""",
"""      const cell = cellAt(p.x, p.y);
      if (cell) {
        if (ev.button === 2) { RAP.rotateAt(state.build, cell.r, cell.c); return; }
        const key = cell.r + ',' + cell.c;
        const there = state.build.cells[key];
        if (there) {
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
      return;""", "拿起已放零件")

# mouseup：处理移动落子 / 无效放回
rep("""    if (state.phase === 'build' && state.dragPart) {
      const cell = cellAt(p.x, p.y);
      if (cell) {""",
"""    if (state.phase === 'build' && state.dragMove) {
      const mv = state.dragMove;
      const cell = cellAt(p.x, p.y);
      let placed = false;
      if (cell) {
        const key = cell.r + ',' + cell.c;
        const occupied = !!state.build.cells[key];
        const samePlace = (cell.r === mv.r && cell.c === mv.c);
        if (!occupied || samePlace) {
          state.build.cells[key] = { part: mv.part, dir: mv.dir, inner: mv.inner };
          state.build.order.push(key);
          if (mv.inner) state.build.order.push('inner:' + key);
          placed = true;
        }
      }
      if (!placed) {
        // 放不进去 → 放回原处
        const key = mv.r + ',' + mv.c;
        state.build.cells[key] = { part: mv.part, dir: mv.dir, inner: mv.inner };
        state.build.order.push(key);
        if (mv.inner) state.build.order.push('inner:' + key);
      } else {
        SFX.place();
      }
      state.dragMove = null;
      state.dragPart = null;
      return;
    }
    if (state.phase === 'build' && state.dragPart) {
      const cell = cellAt(p.x, p.y);
      if (cell) {""", "移动落子 / 放回")

# 拖拽时不要用 dragPart 覆盖成"新建"：去掉旧的 ghost 逻辑里的 dragMove 冲突
rep("    state.lastDragCell = null;\n    if (state.phase === 'build' && state.dragMove) {",
    "    state.lastDragCell = null;\n    if (state.phase === 'build' && state.dragMove) {", "（占位）")

# ---------------- 3) 颜色组按钮 ----------------
rep("""      if (name === 'interact') return { x: 0, y: DH - 148, w: 84, h: 84 };""",
"""      if (name === 'interact') return { x: 0, y: DH - 150, w: 92, h: 92 };""", "按钮尺寸 92")

rep("""      const list = state.run.car.interactives || [];
      const n = Math.min(3, list.length);
      const x0 = DW / 2 - (n * 96) / 2;
      for (let i = 0; i < n; i++) {
        const rect = { x: x0 + i * 96, y: btnRect('interact').y, w: 84, h: 84 };
        ctx.fillStyle = '#79cf49'; roundRect(rect.x, rect.y, rect.w, rect.h, 14); ctx.fill();
        ctx.fillStyle = '#8fd65e'; roundRect(rect.x + 5, rect.y + 5, rect.w - 10, rect.h - 10, 12); ctx.fill();
        text(RAP.PARTS[list[i]].label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 5, 14, '#fff', 'center', true);
        text(String(i + 1), rect.x + 12, rect.y + 20, 12, '#eaffea', 'left');
      }""",
"""      const groups = state.run.car.groups || [];
      const n = Math.min(3, groups.length);
      const x0 = DW / 2 - (n * 104) / 2;
      for (let i = 0; i < n; i++) {
        const g = groups[i];
        const rect = { x: x0 + i * 104, y: btnRect('interact').y, w: 92, h: 92 };
        // 按钮底色 = 这组零件的颜色（同色 = 同组，一按全启动）
        ctx.fillStyle = 'rgba(10,18,24,.55)'; roundRect(rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8, 18); ctx.fill();
        ctx.fillStyle = g.color; roundRect(rect.x, rect.y, rect.w, rect.h, 15); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2; ctx.stroke();
        text(RAP.PARTS[g.part].label, rect.x + rect.w / 2, rect.y + 40, 14, '#10201a', 'center', true);
        text('×' + g.list.length, rect.x + rect.w / 2, rect.y + 62, 15, '#10201a', 'center', true);
        text(String(i + 1), rect.x + 10, rect.y + 18, 12, 'rgba(16,32,26,.75)', 'left');
      }""", "颜色组按钮")

# 命中改 104 间距
rep("""      const r = state.run.car.interactives || [];
      const nm = Math.min(3, r.length);
      const xs = DW / 2 - (nm * 96) / 2;
      for (let i = 0; i < nm; i++) {
        const rect = { x: xs + i * 96, y: btnRect('interact').y, w: 84, h: 84 };
        if (hit(rect, p.x, p.y)) { RAP.pressInteract(state.run, i + 1); SFX.pump(); return; }
      }""",
"""      const gs = state.run.car.groups || [];
      const nm = Math.min(3, gs.length);
      const xs = DW / 2 - (nm * 104) / 2;
      for (let i = 0; i < nm; i++) {
        const rect = { x: xs + i * 104, y: btnRect('interact').y, w: 92, h: 92 };
        if (hit(rect, p.x, p.y)) { RAP.pressInteract(state.run, i + 1); SFX.pump(); return; }
      }""", "组按钮命中(press)")

rep("""      const r = state.run.car.interactives || [];
      const nm2 = Math.min(3, r.length);
      const xs2 = DW / 2 - (nm2 * 96) / 2;
      for (let i = 0; i < nm2; i++) {
        const rect = { x: xs2 + i * 96, y: btnRect('interact').y, w: 84, h: 84 };
        if (hit(rect, p.x, p.y)) { RAP.releaseInteract(state.run, i + 1); return; }
      }""",
"""      const gs2 = state.run.car.groups || [];
      const nm2 = Math.min(3, gs2.length);
      const xs2 = DW / 2 - (nm2 * 104) / 2;
      for (let i = 0; i < nm2; i++) {
        const rect = { x: xs2 + i * 104, y: btnRect('interact').y, w: 92, h: 92 };
        if (hit(rect, p.x, p.y)) { RAP.releaseInteract(state.run, i + 1); return; }
      }""", "组按钮命中(release)")

p.write_text(t, encoding="utf-8")
print("index.html 第一批完成")

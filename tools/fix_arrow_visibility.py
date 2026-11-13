"""箭头只在"建造阶段 + 该零件被选中"时显示。

现状：
- 建造阶段：所有方向件都画箭头
- 行驶阶段：也画箭头（更乱）

改成：
- 建造阶段：只画到**当前选中零件同款**的方向件（选中打气筒 → 只显示所有打气筒的箭头）
- 行驶阶段：完全不画
- 悬停某个方向件时，临时显示那一个（方便查看/旋转）
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) 建造阶段：只画选中同款 or 悬停那一个 ----------
rep("""    // 方向件：画箭头（组装时最重要的信息）
    const hover = cellAt(state.mouse.x, state.mouse.y);
    keys.forEach(k => {
      const cell = state.build.cells[k];
      if (!RAP.isDirectional(cell.part)) return;
      const p = at(k);
      const isHover = hover && hover.r === +k.split(',')[0] && hover.c === +k.split(',')[1];
      drawDirArrow(p.x, p.y, cell.dir || 0, BUILD_PX, RAP.PARTS[cell.part].color, isHover);
      if (isHover) {
        const vv = RAP.dirVec(cell.dir || 0);
        const wd = { '1,0': '右', '-1,0': '左', '0,1': '上', '0,-1': '下' }[vv[0] + ',' + vv[1]] || '';
        text(wd, p.x + vv[0] * BUILD_PX * 0.8, p.y - vv[1] * BUILD_PX * 0.8 + 5, 14, '#ffffff', 'center', true);
      }
    });""",
"""    // 方向件箭头：只在「选中该款零件」或「鼠标悬停在该格」时显示
    const hover = cellAt(state.mouse.x, state.mouse.y);
    keys.forEach(k => {
      const cell = state.build.cells[k];
      if (!RAP.isDirectional(cell.part)) return;
      const rc = k.split(',');
      const isHover = hover && hover.r === +rc[0] && hover.c === +rc[1];
      const isSelectedType = (state.selected === cell.part);   // 选了打气筒才显示所有打气筒
      if (!isHover && !isSelectedType) {
        // 只留一个很小的朝向点，不画箭头（保持"这里有方向件"的可读性）
        const p0 = at(k);
        const v0 = RAP.dirVec(cell.dir || 0);
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.beginPath();
        ctx.arc(p0.x + v0[0] * BUILD_PX * 0.34, p0.y - v0[1] * BUILD_PX * 0.34, BUILD_PX * 0.07, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      const p = at(k);
      drawDirArrow(p.x, p.y, cell.dir || 0, BUILD_PX, RAP.PARTS[cell.part].color, isHover);
      if (isHover) {
        const vv = RAP.dirVec(cell.dir || 0);
        const wd = { '1,0': '右', '-1,0': '左', '0,1': '上', '0,-1': '下' }[vv[0] + ',' + vv[1]] || '';
        text(wd, p.x + vv[0] * BUILD_PX * 0.8, p.y - vv[1] * BUILD_PX * 0.8 + 5, 14, '#ffffff', 'center', true);
      }
    });""", "建造阶段箭头条件")

# ---------- 2) 行驶阶段不再画箭头 ----------
rep("""    // 推进方向箭头（行驶时淡一点，别抢戏）""",
"""    // 推进方向箭头：行驶时不再显示（避免干扰画面，方向在建造期已确认）
    if (false)""", "行驶阶段不画箭头")

p.write_text(t, encoding="utf-8")
print("箭头显示规则已改")

"""修"点框想放猪，结果把框拿起来"的问题：
- 选中的是内嵌件（猪/电池）而目标格是木框 → 应该"放进去"，不是"拿起框"
- 移动时不写入 inner:null
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


rep("""        const key = cell.r + ',' + cell.c;
        const there = state.build.cells[key];
        if (there) {""",
"""        const key = cell.r + ',' + cell.c;
        const there = state.build.cells[key];
        const selDef = RAP.PARTS[state.selected];
        const wantInner = !!(selDef && selDef.inner);
        // 选的是内嵌件（猪/电池）+ 目标格是木框 → 放进去，而不是把框拿起来
        if (there && !(wantInner && RAP.PARTS[there.part].structure)) {""",
    "内嵌件优先放进框")

rep("""          state.build.cells[key] = { part: mv.part, dir: mv.dir, inner: mv.inner };
          state.build.order.push(key);
          if (mv.inner) state.build.order.push('inner:' + key);
          placed = true;""",
"""          state.build.cells[key] = { part: mv.part, dir: mv.dir };
          if (mv.inner) state.build.cells[key].inner = mv.inner;
          state.build.order.push(key);
          if (mv.inner) state.build.order.push('inner:' + key);
          placed = true;""", "落子不写 inner:null")

rep("""        const key = mv.r + ',' + mv.c;
        state.build.cells[key] = { part: mv.part, dir: mv.dir, inner: mv.inner };
        state.build.order.push(key);
        if (mv.inner) state.build.order.push('inner:' + key);""",
"""        const key = mv.r + ',' + mv.c;
        state.build.cells[key] = { part: mv.part, dir: mv.dir };
        if (mv.inner) state.build.cells[key].inner = mv.inner;
        state.build.order.push(key);
        if (mv.inner) state.build.order.push('inner:' + key);""", "放回不写 inner:null")

p.write_text(t, encoding="utf-8")
print("done")

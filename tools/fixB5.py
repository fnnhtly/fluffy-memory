"""把「帮助 / 暂停 / 重来」的点击处理插到 mousedown 最前面（任何阶段都先判这三个）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

anchor = """    // 顶部关卡页签
    for (let i = 0; i < levels.length; i++) {
      if (hit(tabRect(i), p.x, p.y)) { startLevel(i); return; }
    }
"""
assert anchor in t, "anchor missing"

block = anchor + """
    // 全局按钮：帮助 / 暂停 / 重来（先判这三个，避免被别的分支吃掉）
    {
      const hb = btnRect('help');
      if (hb && hit(hb, p.x, p.y)) { state.helpOpen = !state.helpOpen; return; }
      const pb = btnRect('pause');
      if (pb && hit(pb, p.x, p.y)) { state.paused = !state.paused; return; }
      const rb = btnRect('restartRun');
      if (rb && hit(rb, p.x, p.y)) {
        state.phase = 'build'; state.run = null; state.paused = false;
        return;
      }
    }
"""
t = t.replace(anchor, block)
p.write_text(t, encoding="utf-8")
print("handlers inserted at top:", "全局按钮" in t)

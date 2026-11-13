"""刹车按下处理挪到 mousedown 的全局按钮区（之前误插到 mouseup 里了）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 从 mouseup 移除
rep("""      const BK2 = btnRect('brake');
      if (BK2 && hit(BK2, p.x, p.y)) { RAP.setBrake(state.run, true); return; }
""", "", "从 mouseup 移除")

# 2) 加到 mousedown 全局按钮区
rep("""      const rb = btnRect('restartRun');
      if (rb && hit(rb, p.x, p.y)) {
        state.phase = 'build'; state.run = null; state.paused = false;
        return;
      }
    }""",
"""      const rb = btnRect('restartRun');
      if (rb && hit(rb, p.x, p.y)) {
        state.phase = 'build'; state.run = null; state.paused = false;
        return;
      }
      const bk = btnRect('brake');
      if (bk && hit(bk, p.x, p.y) && state.run) { RAP.setBrake(state.run, true); return; }
    }""", "mousedown 刹车")

p.write_text(t, encoding="utf-8")
print("done")

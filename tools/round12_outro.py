"""结算推镜过渡：进入 resolved 后先推近 0.2 秒再盖卡片。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 进入 resolved 时重置 outroT
rep("""        state.phase = 'resolved';
        state.resultT = 0;
        state.slowmo = Math.max(state.slowmo, 0.75);   // 过关瞬间放慢（比撞击更久）""",
"""        state.phase = 'resolved';
        state.resultT = 0;
        state.outroT = 0;                              // 推镜过渡计时
        state.slowmo = Math.max(state.slowmo, 0.75);   // 过关瞬间放慢（比撞击更久）""",
    "重置 outroT")

# 2) drawRun 里结算前推镜（在 drawResult 之前收紧镜头）
rep("      if (state.slowmo > 0 && state.phase === 'run') {",
"""      // 结算推镜：0.2 秒内把镜头推近 12%（再盖卡片，避免硬切）
      if (state.phase === 'resolved' && state.outroT < 1) {
        state.outroT = Math.min(1, state.outroT + dt / 0.2);
        const kz = 1 + 0.12 * (1 - Math.pow(1 - state.outroT, 2));
        state.camState.zoom *= 1 + (kz - 1) * 0.35;
      }
      if (state.slowmo > 0 && state.phase === 'run') {""",
    "结算推镜")

p.write_text(t, encoding="utf-8")
print("推镜过渡完成")

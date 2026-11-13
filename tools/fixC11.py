"""刹车接进 UI：右下角刹车钮（按住即刹）+ ↓/S 键；按钮上写明"按住"。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 按钮矩形（run 阶段）：放在交互组按钮右侧
rep("      if (name === 'interact') return { x: 0, y: DH - 150, w: 92, h: 92 };",
    "      if (name === 'interact') return { x: 0, y: DH - 150, w: 92, h: 92 };\n"
    "      if (name === 'brake') return { x: DW - 128, y: DH - 150, w: 92, h: 92 };", "刹车按钮矩形")

# 2) 绘制刹车钮
rep("""      const gs2 = state.run.car.groups || [];""",
"""      // 刹车钮（按住即刹）
      const BK = btnRect('brake');
      if (BK) {
        const on = state.run.car.braking;
        ctx.fillStyle = on ? '#e0513c' : 'rgba(24,34,42,.85)';
        roundRect(BK.x, BK.y, BK.w, BK.h, 15); ctx.fill();
        ctx.strokeStyle = on ? '#ffd9d0' : 'rgba(232,200,122,.6)';
        ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = on ? '#fff' : '#e8d9a8';
        roundRect(BK.x + 22, BK.y + 26, BK.w - 44, 30, 6); ctx.fill();
        text('刹', BK.x + BK.w / 2, BK.y + 50, 20, on ? '#e0513c' : '#132430', 'center', true);
        text('按住', BK.x + BK.w / 2, BK.y + 76, 11, on ? '#ffe0d8' : '#9fb2c2', 'center');
      }
      const gs2 = state.run.car.groups || [];""", "刹车按钮绘制")

# 3) 点击/松开
rep("""    if (state.phase === 'run' && state.run) {
      const gs = state.run.car.groups || [];""",
"""    if (state.phase === 'run' && state.run) {
      const BK2 = btnRect('brake');
      if (BK2 && hit(BK2, p.x, p.y)) { RAP.setBrake(state.run, true); return; }
      const gs = state.run.car.groups || [];""", "按下刹车")

rep("""    if (state.phase === 'run' && state.run) {
      const gs2 = state.run.car.groups || [];""",
"""    if (state.phase === 'run' && state.run) {
      RAP.setBrake(state.run, false);      // 松手即松开刹车
      const gs2 = state.run.car.groups || [];""", "松开刹车")

# 4) 键盘 ↓ / S
rep("    } else if (state.phase === 'run' && state.run) {",
"""    } else if (state.phase === 'run' && state.run) {
      if (k === 'arrowdown' || k === 's') { RAP.setBrake(state.run, true); ev.preventDefault(); }""", "↓/S 刹车")

p.write_text(t, encoding="utf-8")
print("done")

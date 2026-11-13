"""刹车 UI：矩形 / 绘制 / 按下刹车 / 全局 mouseup 松开 / ↓·S 键。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


rep("      if (name === 'interact') return { x: 0, y: DH - 150, w: 92, h: 92 };",
    "      if (name === 'interact') return { x: 0, y: DH - 150, w: 92, h: 92 };\n"
    "      if (name === 'brake') return { x: DW - 128, y: DH - 150, w: 92, h: 92 };", "刹车按钮矩形")

rep("""      const groups = state.run.car.groups || [];""",
"""      // 刹车钮（按住即刹）
      const BK = btnRect('brake');
      if (BK) {
        const on = state.run.car.braking;
        ctx.fillStyle = on ? '#e0513c' : 'rgba(24,34,42,.9)';
        roundRect(BK.x, BK.y, BK.w, BK.h, 15); ctx.fill();
        ctx.strokeStyle = on ? '#ffd9d0' : 'rgba(232,200,122,.65)';
        ctx.lineWidth = 2; ctx.stroke();
        text('刹', BK.x + BK.w / 2, BK.y + 44, 26, on ? '#fff' : '#ffe9b0', 'center', true);
        text('按住', BK.x + BK.w / 2, BK.y + 68, 11, on ? '#ffe0d8' : '#9fb2c2', 'center');
      }
      const groups = state.run.car.groups || [];""", "刹车按钮绘制")

rep("""    if (state.phase === 'run' && state.run) {
      const gs2 = state.run.car.groups || [];""",
"""    if (state.phase === 'run' && state.run) {
      const BK2 = btnRect('brake');
      if (BK2 && hit(BK2, p.x, p.y)) { RAP.setBrake(state.run, true); return; }
      const gs2 = state.run.car.groups || [];""", "按下刹车")
if "const BK2" not in t:
    # 用按下分支的实际写法再试一次
    rep("""    if (state.phase === 'run' && state.run) {
      const gs = state.run.car.groups || [];""",
"""    if (state.phase === 'run' && state.run) {
      const BK2 = btnRect('brake');
      if (BK2 && hit(BK2, p.x, p.y)) { RAP.setBrake(state.run, true); return; }
      const gs = state.run.car.groups || [];""", "按下刹车(2)")

# 全局 mouseup 松开
rep("""  cv.addEventListener('mouseup', ev => {
    const p = canvasPos(ev);""",
"""  cv.addEventListener('mouseup', ev => {
    const p = canvasPos(ev);
    if (state.run) RAP.setBrake(state.run, false);   // 松手松刹车""", "松开刹车")

# 键盘
rep("    } else if (state.phase === 'run' && state.run) {",
"""    } else if (state.phase === 'run' && state.run) {
      if (k === 'arrowdown' || k === 's') { RAP.setBrake(state.run, true); ev.preventDefault(); }""", "↓/S 刹车")

p.write_text(t, encoding="utf-8")
print("done")

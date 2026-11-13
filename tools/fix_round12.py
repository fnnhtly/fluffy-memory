"""修"橡皮一点就整屏消失"（致命渲染异常）+ 加渲染安全网。

原因：选中橡皮后按住鼠标，ghost = 'eraser'，drawPartShape 里 RAP.PARTS['eraser'] 是 undefined →
TypeError → 每帧 clearRect 后抛异常 → 画面全空、rAF 循环死掉，且无法恢复。

三层防护：
1) drawPartShape 里 def 不存在时画一个占位方块，绝不再抛
2) 建造幽灵：橡皮单独画（一块白色橡皮 + 斜线），不传给 drawPartShape
3) frame() 整体 try/catch：出错时在角落写一行错误，循环继续（永远不再"整屏消失"）
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) drawPartShape 防空
rep("""  function drawPartShape(part, cx, cy, size, dir, hp) {
    const def = RAP.PARTS[part];
    const h = size / 2;""",
"""  function drawPartShape(part, cx, cy, size, dir, hp) {
    const def = RAP.PARTS[part];
    if (!def) {                       // 防御：未知零件（比如橡皮）不进入下面的分支
      ctx.fillStyle = 'rgba(230,236,242,.9)';
      roundRect(cx - size / 2, cy - size / 2, size, size, 4); ctx.fill();
      return;
    }
    const h = size / 2;""", "drawPartShape 防空")

# 2) 幽灵：橡皮单独画
rep("""    const ghost = state.dragPart || (state.selected !== 'eraser' ? state.selected : null);
    if (ghost && state.mouse.down) {
      ctx.globalAlpha = 0.55;
      drawPartShape(ghost, state.mouse.x, state.mouse.y, BUILD_PX * 0.84, 0);
      ctx.globalAlpha = 1;""",
"""    const ghost = state.dragPart || (state.selected !== 'eraser' ? state.selected : null);
    if (state.mouse.down && (!ghost || ghost === 'eraser')) {
      // 橡皮的幽灵：一块白色橡皮 + 斜线，提示"点这里删掉"
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#e6ecf2';
      roundRect(state.mouse.x - BUILD_PX * 0.36, state.mouse.y - BUILD_PX * 0.26,
        BUILD_PX * 0.72, BUILD_PX * 0.52, 6); ctx.fill();
      ctx.strokeStyle = '#e0513c'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(state.mouse.x - BUILD_PX * 0.2, state.mouse.y - BUILD_PX * 0.1);
      ctx.lineTo(state.mouse.x + BUILD_PX * 0.2, state.mouse.y + BUILD_PX * 0.1);
      ctx.stroke();
      ctx.restore();
    } else if (ghost && state.mouse.down) {
      ctx.globalAlpha = 0.55;
      drawPartShape(ghost, state.mouse.x, state.mouse.y, BUILD_PX * 0.84, 0);
      ctx.globalAlpha = 1;""", "橡皮幽灵单独画")

# 3) frame 安全网
rep("""  let last = performance.now();
  function frame(now) {""",
"""  let last = performance.now();
  let frameErr = null;
  function frame(now) {
    try { frameBody(now); } catch (e) {
      frameErr = (e && e.message) || String(e);
      console.error('frame error:', e);
      try {
        ctx.fillStyle = 'rgba(200,60,40,.9)';
        ctx.fillRect(8, 8, 560, 26);
        text('渲染异常（游戏继续）：' + frameErr, 16, 26, 13, '#fff');
      } catch (e2) {}
    }
    requestAnimationFrame(frame);
  }
  function frameBody(now) {""", "frame 安全网")

# frameBody 末尾原本自己又 requestAnimationFrame，去掉（外层已排）
rep("""    drawToast();
    requestAnimationFrame(frame);
  }""",
"""    drawToast();
  }""", "去掉重复 rAF")

p.write_text(t, encoding="utf-8")
print("done")

"""真正适配 21:9 / 4:3：不再加黑边，而是按实际画布宽高比扩展"可视世界范围"。

思路：
- 保留 1280×720 作为**设计基准**（HUD 的像素坐标都基于它）
- 画布按实际窗口尺寸设置像素，`ctx.setTransform` 做等比缩放
- 世界渲染（drawWorld / drawRun）用**实际可视范围**：宽屏能看到更宽的景，4:3 上下更多
- HUD 仍按 1280×720 布局，但整体居中（宽屏时居中留边，视觉上仍在中央）

具体做法：用 `VIEW_W / VIEW_H` 表示当前设计坐标下的可视尺寸，
等比缩放已经保证 1280×720 始终铺满，超出的部分由 VIEW 扩展。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 可视尺寸变量 + 更新逻辑（放在 applyCanvasSize 里）
rep("""  function applyCanvasSize() {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(640, Math.round(r.width * dpr));
    const h = Math.round(w * DH / DW);
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    // 让 1 设计像素 = 缩放后的实际像素
    ctx.setTransform(w / DW, 0, 0, h / DH, 0, 0);
  }""",
"""  // 当前可视尺寸（设计坐标）。默认 = 设计分辨率；宽/高比例变化时扩展对应方向
  let VIEW_W = DW, VIEW_H = DH;
  let VIEW_OFF_X = 0, VIEW_OFF_Y = 0;   // 扩展后设计坐标的偏移（HUD 居中用）

  function applyCanvasSize() {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = Math.max(320, r.width || DW);
    const cssH = Math.max(180, r.height || DH);
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }

    // 以 1280×720 为基准等比铺满（cover），超出的方向扩展可视范围
    const scale = Math.max(DW / cssW, DH / cssH);
    VIEW_W = Math.round(cssW * scale);
    VIEW_H = Math.round(cssH * scale);
    VIEW_OFF_X = (VIEW_W - DW) / 2;
    VIEW_OFF_Y = (VIEW_H - DH) / 2;

    // 缩放：1 设计像素 = w/VIEW_W 实际像素
    const sx = w / VIEW_W, sy = h / VIEW_H;
    ctx.setTransform(sx, 0, 0, sy, VIEW_OFF_X * sx, VIEW_OFF_Y * sy);
  }""", "可视尺寸")

# 2) canvasPos 用可视尺寸换算
rep("""  function canvasPos(ev) {
    const r = cv.getBoundingClientRect();
    // 事件坐标 → 设计坐标（1280×720），与实际画布像素无关
    return { x: (ev.clientX - r.left) * DW / r.width, y: (ev.clientY - r.top) * DH / r.height };
  }""",
"""  function canvasPos(ev) {
    const r = cv.getBoundingClientRect();
    // 事件坐标 → 可视设计坐标（考虑宽屏扩展）
    return {
      x: (ev.clientX - r.left) * VIEW_W / r.width - VIEW_OFF_X,
      y: (ev.clientY - r.top) * VIEW_H / r.height - VIEW_OFF_Y
    };
  }""", "canvasPos 可视")

# 3) 清屏范围改为可视尺寸
rep("    ctx.clearRect(0, 0, DW, DH);", "    ctx.clearRect(-VIEW_OFF_X - 2, -VIEW_OFF_Y - 2, VIEW_W + 4, VIEW_H + 4);", "清屏可视")

# 4) drawWorld / drawRun 的世界渲染范围用 VIEW
rep("    const leftW = cam.x - DW / 2 / s - 2, rightW = cam.x + DW / 2 / s + 2;",
    "    const leftW = cam.x - VIEW_W / 2 / s - 2, rightW = cam.x + VIEW_W / 2 / s + 2;", "世界范围 X")

p.write_text(t, encoding="utf-8")
print("可视范围扩展完成")

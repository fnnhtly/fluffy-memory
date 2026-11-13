"""第 7 轮：多分辨率自适应（直接对应千星的 5 种画布）

千星画布预设：1280×720 / 1560×720 / 1280×960 / 1600×900 / 2100×900
现在的代码把 DW/DH 写死成 1280×720，宽屏会拉伸变形。

做法：保持"设计分辨率 1280×720"作为坐标基准，用 CSS 让 canvas 铺满窗口保持比例，
并在内部按实际窗口尺寸调整画布像素（避免拉伸），
同时在 HUD 上显示当前分辨率，并提供 5 种预设的切换按钮用于自测。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) CSS：canvas 保持 16:9 铺满，不拉伸
rep("  canvas { display: block; box-shadow: 0 10px 40px rgba(0,0,0,.6); cursor: pointer;\n"
    "    width: min(100vw, 1280px); height: auto; aspect-ratio: 16 / 9; }",
    "  canvas { display: block; box-shadow: 0 10px 40px rgba(0,0,0,.6); cursor: pointer;\n"
    "    width: min(100vw, 100vh * 16 / 9); height: auto; aspect-ratio: 16 / 9; }\n"
    "  body.letterbox canvas { box-shadow: none; }", "CSS 自适应")

# 2) 分辨率档位 + 应用函数
rep("  const DW = 1280, DH = 720, PPM = 32;   // 32 px = 1 m（与千星\"1 格 = 32 逻辑像素\"一致）",
"""  // 设计分辨率（所有坐标都基于它）；实际画布按窗口等比缩放
  const DW = 1280, DH = 720, PPM = 32;

  // 千星的画布预设（用于自测各尺寸下的排版）
  const CANVAS_PRESETS = [
    { id: 'pc-16-9', label: 'PC 1600×900', w: 1600, h: 900 },
    { id: 'pc-21-9', label: 'PC 2100×900', w: 2100, h: 900 },
    { id: 'mobile-16-9', label: '手机 1280×720', w: 1280, h: 720 },
    { id: 'mobile-19.5-9', label: '手机 1560×720', w: 1560, h: 720 },
    { id: 'mobile-4-3', label: '手机 1280×960', w: 1280, h: 960 }
  ];
  let curPreset = 0;      // 当前模拟的画布尺寸（只影响自测与显示）

  // 把画布像素对齐到"设计分辨率 × 缩放"，避免非整数缩放导致的模糊
  function applyCanvasSize() {
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
  }""", "分辨率档位")

# 3) canvasPos 要用 bounding rect（绘制坐标系已缩放，但事件坐标仍是 CSS 像素）
rep("""  function canvasPos(ev) {
    const r = cv.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * DW / r.width, y: (ev.clientY - r.top) * DH / r.height };
  }""",
"""  function canvasPos(ev) {
    const r = cv.getBoundingClientRect();
    // 事件坐标 → 设计坐标（1280×720），与实际画布像素无关
    return { x: (ev.clientX - r.left) * DW / r.width, y: (ev.clientY - r.top) * DH / r.height };
  }""", "canvasPos 注释")

# 4) frameBody 每帧对齐画布尺寸
rep("  function frameBody(now) {",
"""  function frameBody(now) {
    applyCanvasSize();""", "每帧对齐")

# 5) 清屏要用设计坐标（setTransform 已处理）
rep("    ctx.clearRect(0, 0, DW, DH);", "    ctx.clearRect(0, 0, DW, DH);", "清屏（无需改）")

# 6) 键：F1..F5 切画布预设（自测用）
rep("    if (k === 'escape' || k === 'l') { state.levelSelect = !state.levelSelect; return; }",
"""    if (k === 'escape' || k === 'l') { state.levelSelect = !state.levelSelect; return; }
    if (k === 'f1' || k === 'f2' || k === 'f3' || k === 'f4' || k === 'f5') {
      curPreset = parseInt(k.slice(1), 10) - 1;
      const pr = CANVAS_PRESETS[curPreset];
      // 直接用该尺寸模拟：把 canvas 的 CSS 宽高比换掉，看排版是否崩
      cv.style.aspectRatio = pr.w + ' / ' + pr.h;
      toast('画布：' + pr.label + '（看排版是否溢出）');
      return;
    }""", "F1-F5 切画布")

p.write_text(t, encoding="utf-8")
print("自适应完成")

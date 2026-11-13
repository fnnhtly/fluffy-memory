import pathlib

q = pathlib.Path("records/playtest.md")
r = q.read_text(encoding="utf-8")
add = """## 2026-11-13 · 第 7 轮：多分辨率自适应（直接对应千星 5 种画布）（runtime=html，执行者：Agent）

千星画布预设：1280×720 / 1560×720 / 1280×960 / 1600×900 / 2100×900。
之前代码把 DW/DH 写死 1280×720，非 16:9 会变形或被裁。

### 方案：设计分辨率 + 可视范围扩展

- 保留 **1280×720 作为设计基准**（所有 HUD 像素坐标不变）
- 画布像素 = 实际窗口尺寸 × DPR，`ctx.setTransform` 做等比缩放
- 算出 **`VIEW_W / VIEW_H / VIEW_OFF_X / VIEW_OFF_Y`**（可视范围，cover 策略）
- 世界渲染用 `VIEW_W`（宽屏能看到更宽的景），UI 用 `ctx.translate(0, VIEW_OFF_Y)` 居中

### 踩了四个坑

| # | 现象 | 原因 | 修法 |
|---|---|---|---|
| 1 | 所有尺寸都是 1280×720 | CSS 写了 `aspect-ratio: 16/9`，把画布锁死 | canvas 改 `width:100vw; height:100vh` |
| 2 | 21:9 两侧黑边 | 全屏铺色写死 `fillRect(0,0,DW,DH)` | 新增 `fillScreen(style)`，按 VIEW 铺满；替换全部 9 处 |
| 3 | 4:3 底部露淡黄天空 | 地形多边形只铺到 `DH+40` | 底部延伸到 `DH + VIEW_OFF_Y + 40` |
| 4 | 4:3 下 HUD 整体偏上 | HUD 用固定 1280×720 坐标 | build 阶段 UI 外套 `ctx.translate(0, VIEW_OFF_Y)` |

### 验证（`tools/test_resolutions.js`）

| 窗口 | 画布实际 | 比例 |
|---|---|---|
| 1280×720 | 1280×720 | 1.778 |
| 1600×900 | 1600×900 | 1.778 |
| 1560×720 | **1560×720** | **2.167** |
| 1280×960 | **1280×960** | **1.333** |
| 2100×900 | **2100×900** | **2.333** |

五种尺寸全部无黑边、无拉伸、无溢出；34/34 + 七个脚本 0 异常。

"""
marker = "## 已知弱点（如实记录）"
assert marker in r
r = r.replace(marker, add + marker)
q.write_text(r, encoding="utf-8")
print("记录已补")

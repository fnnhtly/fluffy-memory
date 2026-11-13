"""性能优化：把"静态且昂贵"的图层缓存到离屏 canvas。

瓶颈实测：石头纹理每帧 240 块 × 5 次调用 ≈ 1200 次，占每帧 1500 次调用的 80%。
石头层是**确定性的**（只跟地形和相机位置有关），完全可以缓存。

做法：
1. 建一个离屏 canvas（尺寸按可视区）
2. 石头层只在"相机移动超过阈值"时重绘一次
3. 每帧只 drawImage 一次
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 1) 全局离屏画布 + 缓存状态
anchor = "  // 铺满整个可视区（宽屏时覆盖扩展部分，避免黑边）"
assert anchor in t, "anchor not found"
cache_code = """  // ---------- 石头层缓存（性能优化：静态层不每帧重画） ----------
  const stoneLayer = document.createElement('canvas');
  const stoneCtx = stoneLayer.getContext('2d');
  let stoneCacheKey = '';

""" + anchor
t = t.replace(anchor, cache_code, 1)

# 2) 提取石头绘制成独立函数（在 drawWorld 之外）
#    找到 drawWorld 里石头部分的起止
start = t.find("    // ---------- 石块：确定性伪随机，不规则多边形 ----------")
if start < 0:
    start = t.find("    const stoneW = 78 * cam.zoom")
    start = t.rfind("\n", 0, t.rfind("\n", 0, start))
assert start > 0, "stone block not found"

end_marker = "    // 石头表面的小碎石"
end = t.find(end_marker, start)
if end < 0:
    end = t.find("    // 地表材质带", start)
assert end > start, "stone block end not found"

stone_body = t[start:end]
t = t[:start] + t[end:]

# 3) 包装成函数，接收 ctx 并在离屏画布上画
stone_fn = """
  // 在离屏画布上画石头层（只在相机明显移动时重绘）
  function paintStoneLayer(ter, cam, W, H) {
    const ctx0 = ctx;
    // 临时把全局 ctx 指向离屏上下文（下面的绘制代码用的都是 ctx）
    ctx = stoneCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // 平移：让世界坐标落在离屏画布里
    ctx.translate(W / 2, H / 2);

    const s = PPM * cam.zoom;
    const toX = wx => (wx - cam.x) * s;
    const toY = wy => -(wy - cam.y) * s;

    // 地形多边形裁剪
    const leftW = cam.x - W / 2 / s - 2, rightW = cam.x + W / 2 / s + 2;
    const stepW = 5 / s;
    const pts = [];
    for (let x = leftW; x <= rightW; x += stepW) pts.push([x, ter.surfaceY(x)]);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(toX(pts[0][0]), toY(pts[0][1]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(toX(pts[i][0]), toY(pts[i][1]));
    ctx.lineTo(toX(pts[pts.length - 1][0]), H);
    ctx.lineTo(toX(pts[0][0]), H);
    ctx.closePath();
    ctx.clip();

    STONE_BODY_PLACEHOLDER

    ctx.restore();
    ctx = ctx0;   // 还原
  }

"""
# 把原石头代码里的 VIEW_OFF_X 等替换（离屏画布已平移，不需要）
body = stone_body
body = body.replace("VIEW_OFF_X", "0").replace("VIEW_OFF_Y", "0")
body = body.replace("VIEW_W + ", "W + ").replace("VIEW_H + ", "H + ")
# 修正: 上面的 replace 会把 "VIEW_W + VIEW_OFF_X * 2" 变成 "W + 0 * 2"，没问题
stone_fn = stone_fn.replace("STONE_BODY_PLACEHOLDER", body)

# 插到 drawWorld 之前
anchor2 = "  function drawWorld(ter, cam) {"
assert anchor2 in t
t = t.replace(anchor2, stone_fn + anchor2, 1)

p.write_text(t, encoding="utf-8")
print("石头层已提取为独立函数（待接入缓存逻辑）")

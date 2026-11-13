"""把丛林/远山/远景地面也缓存（它们同样只依赖相机位置）。

石头层已经缓存了。剩下的大头：
- 丛林三层（约 150 个圆 + 叶尖）
- 远山（10 个三角）
- 远景地面渐变

这些都在"地平线以上"，一起缓存到第二张离屏画布。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 1) 加第二张离屏画布
old = """  const stoneLayer = document.createElement('canvas');
  const stoneCtx = stoneLayer.getContext('2d');
  let stoneCacheKey = '';"""
new = """  const stoneLayer = document.createElement('canvas');
  const stoneCtx = stoneLayer.getContext('2d');
  let stoneCacheKey = '';
  const skyLayer = document.createElement('canvas');   // 天空+远山+丛林
  const skyCtx = skyLayer.getContext('2d');
  let skyCacheKey = '';"""
assert old in t
t = t.replace(old, new, 1)

# 2) 找到丛林段起点（行尾"const horizonY"）和终点（地形绘制之前）
m_start = t.find("    const horizonY = toY(ter.surfaceY(cam.x) + 2.6);")
assert m_start > 0, "horizonY not found"
# 往前含"远景地面"备选
pre = t.rfind("    // 远景地面", 0, m_start)
if pre > 0 and m_start - pre < 900:
    m_start = pre
end = t.find("    // ---------- 地形：折线采样 ----------", m_start)
if end < 0:
    end = t.find("    const leftW = cam.x -", m_start)
assert end > m_start, "terrain start not found"

# 注意：这段里有 fillScreen 调用，缓存时必须用离屏 ctx
sky_block = t[m_start:end]
print("天空+丛林段行数:", sky_block.count("\n"))

# 3) 替换成缓存版本
cache_impl = """    // ---------- 天空/远山/丛林（离屏缓存）----------
    {
      const cw = cv.width, ch = cv.height;
      if (skyLayer.width !== cw || skyLayer.height !== ch) {
        skyLayer.width = cw;
        skyLayer.height = ch;
        skyCacheKey = '';
      }
      const key = Math.round(cam.x * 4) + ',' + Math.round(cam.y * 4) + ',' +
        cam.zoom.toFixed(1) + ',' + (level().biome || '') + ',' + cw;
      if (key !== skyCacheKey) {
        skyCacheKey = key;
        const savedCtx = ctx;
        const savedFillScreen = fillScreen;
        ctx = skyCtx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        const sx = cw / VIEW_W, sy = ch / VIEW_H;
        ctx.setTransform(sx, 0, 0, sy, VIEW_OFF_X * sx, VIEW_OFF_Y * sy);
SKY_BODY
        ctx = savedCtx;
      }
      ctx.drawImage(skyLayer, -VIEW_OFF_X, -VIEW_OFF_Y, VIEW_W, VIEW_H);
    }

"""
cache_impl = cache_impl.replace("SKY_BODY", sky_block.rstrip())
t = t[:m_start] + cache_impl + t[end:]
p.write_text(t, encoding="utf-8")
print("天空/丛林缓存已接入")

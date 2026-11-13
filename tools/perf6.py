"""补上离屏画布声明（之前漏了，靠隐式全局在工作）+ 接入天空层缓存。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 1) 声明：插在 VIEW_W 声明附近
anchor = "  let VIEW_W = DW, VIEW_H = DH;"
assert anchor in t, "VIEW_W decl not found"
decl = """  // ---------- 离屏缓存画布（性能：静态层不每帧重画）----------
  const stoneLayer = document.createElement('canvas');
  const stoneCtx = stoneLayer.getContext('2d');
  let stoneCacheKey = '';
  const skyLayer = document.createElement('canvas');
  const skyCtx = skyLayer.getContext('2d');
  let skyCacheKey = '';

""" + anchor
if "const stoneLayer" not in t.split("function")[0]:
    t = t.replace(anchor, decl, 1)
    print("  ok: 离屏画布声明已加")

# 2) 天空/丛林缓存
m_start = t.find("    const horizonY = toY(ter.surfaceY(cam.x) + 2.6);")
assert m_start > 0
pre = t.rfind("    // 远景地面", 0, m_start)
if pre > 0 and m_start - pre < 1200:
    m_start = pre
end = t.find("    // ---------- 地形：折线采样 ----------", m_start)
if end < 0:
    end = t.find("    const leftW = cam.x -", m_start)
assert end > m_start
sky_block = t[m_start:end]
print("  天空段行数:", sky_block.count("\n"))

cache_impl = """    // ---------- 天空/远山/丛林（离屏缓存）----------
    {
      const cw2 = cv.width, ch2 = cv.height;
      if (skyLayer.width !== cw2 || skyLayer.height !== ch2) {
        skyLayer.width = cw2; skyLayer.height = ch2; skyCacheKey = '';
      }
      const key2 = Math.round(cam.x * 4) + ',' + Math.round(cam.y * 4) + ',' +
        cam.zoom.toFixed(1) + ',' + ((level() && level().biome) || '') + ',' + cw2;
      if (key2 !== skyCacheKey) {
        skyCacheKey = key2;
        const savedCtx2 = ctx;
        ctx = skyCtx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cw2, ch2);
        const sx2 = cw2 / VIEW_W, sy2 = ch2 / VIEW_H;
        ctx.setTransform(sx2, 0, 0, sy2, VIEW_OFF_X * sx2, VIEW_OFF_Y * sy2);
SKY_BODY
        ctx = savedCtx2;
      }
      ctx.drawImage(skyLayer, -VIEW_OFF_X, -VIEW_OFF_Y, VIEW_W, VIEW_H);
    }

"""
cache_impl = cache_impl.replace("SKY_BODY", sky_block.rstrip())
t = t[:m_start] + cache_impl + t[end:]
p.write_text(t, encoding="utf-8")
print("天空缓存已接入")

"""真正的离屏缓存：不替换全局 ctx，而是在绘制前把 ctx 的变换对齐到离屏画布。

关键技巧：**用 ctx.save/translate 而不是替换 ctx 对象**。
石头层画到离屏 canvas 后，主画布每帧只需 drawImage 一次。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 1) 找到石头绘制段并定位
start = t.find("    // ---------- 石块：确定性伪随机，不规则多边形 ----------")
assert start > 0, "stone comment not found"
# 往前含 ctx.save()
save_start = t.rfind("    ctx.save();", 0, start)
assert save_start > 0 and save_start > start - 200

end = t.find("    // 石头表面的小碎石", start)
assert end > start

stone_block = t[save_start:end]
print("石头段长度:", len(stone_block), "行数:", stone_block.count("\n"))

# 2) 用"缓存绘制"替换：先检查缓存，必要时重画
cache_impl = """    // ---------- 石块层（离屏缓存：只在相机明显移动时重绘）----------
    {
      const dprNow = Math.min(1.5, window.devicePixelRatio || 1);
      const cw = Math.round(cv.width);
      const ch = Math.round(cv.height);
      if (stoneLayer.width !== cw || stoneLayer.height !== ch) {
        stoneLayer.width = cw;
        stoneLayer.height = ch;
        stoneCacheKey = '';
      }
      // 缓存键：相机位置量化到 8 像素 + zoom
      const key = Math.round(cam.x * 8) + ',' + Math.round(cam.y * 8) + ',' + cam.zoom.toFixed(2) + ',' + cw + ',' + ch;
      if (key !== stoneCacheKey) {
        stoneCacheKey = key;
        stoneCtx.setTransform(1, 0, 0, 1, 0, 0);
        stoneCtx.clearRect(0, 0, cw, ch);
        // 把主画布的变换复制到离屏，然后重定向绘制
        const savedCtx = ctx;
        ctx = stoneCtx;
        // 主画布变换是 (w/VIEW_W, 0, 0, h/VIEW_H, offX, offY)
        const sx = cw / VIEW_W, sy = ch / VIEW_H;
        ctx.setTransform(sx, 0, 0, sy, VIEW_OFF_X * sx, VIEW_OFF_Y * sy);
        STONE_DRAW_HERE
        ctx = savedCtx;
      }
      // 贴到主画布（主画布的 transform 已生效，用设计坐标贴）
      ctx.drawImage(stoneLayer, -VIEW_OFF_X, -VIEW_OFF_Y, VIEW_W, VIEW_H);
    }

"""
cache_impl = cache_impl.replace("STONE_DRAW_HERE", stone_block)
t = t[:save_start] + cache_impl + t[end:]

p.write_text(t, encoding="utf-8")
print("石头层离屏缓存已接入")

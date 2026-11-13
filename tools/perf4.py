"""石头层离屏缓存（按实际锚点：石块段从注释后的 ctx.save() 开始）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

marker = "    // ---------- 石块：确定性伪随机，不规则多边形 ----------"
i = t.find(marker)
assert i > 0, "marker not found"

# 从 marker 之后找 ctx.save()
save_i = t.find("    ctx.save();", i)
assert save_i > i, "save not found"

end = t.find("    // 石头表面的小碎石", save_i)
assert end > save_i, "end not found"

stone_block = t[save_i:end]
print("石头段行数:", stone_block.count("\n"))

cache_impl = """    // ---------- 石块层（离屏缓存：只在相机明显移动时重绘）----------
    {
      const cw = cv.width, ch = cv.height;
      if (stoneLayer.width !== cw || stoneLayer.height !== ch) {
        stoneLayer.width = cw;
        stoneLayer.height = ch;
        stoneCacheKey = '';
      }
      const key = Math.round(cam.x * 6) + ',' + Math.round(cam.y * 6) + ',' + cam.zoom.toFixed(2);
      if (key !== stoneCacheKey) {
        stoneCacheKey = key;
        const savedCtx = ctx;
        ctx = stoneCtx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        const sx = cw / VIEW_W, sy = ch / VIEW_H;
        ctx.setTransform(sx, 0, 0, sy, VIEW_OFF_X * sx, VIEW_OFF_Y * sy);
STONE_BODY
        ctx = savedCtx;
      }
      ctx.drawImage(stoneLayer, -VIEW_OFF_X, -VIEW_OFF_Y, VIEW_W, VIEW_H);
    }

"""
cache_impl = cache_impl.replace("STONE_BODY", stone_block.rstrip())
t = t[:save_i] + cache_impl + t[end:]
p.write_text(t, encoding="utf-8")
print("已接入离屏缓存")

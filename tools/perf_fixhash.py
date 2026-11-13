"""把 hash 函数提到模块级（原来定义在石头缓存块内部，外面的小碎石用不到）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 抠出 hash 函数
start = t.find("    function hash(a, b) {")
assert start > 0
end = t.find("\n    }", start) + len("\n    }")
hash_fn = t[start:end]
t = t[:start] + "    // hash 已提升到模块级（见 drawHash）" + t[end:]
print("已移除内部 hash，长度", len(hash_fn))

# 以模块级名字插入（避免重名冲突）
i = t.find("  // ---------- 地形缓存（关卡不变就不重建） ----------")
assert i > 0
mod_hash = """  // 确定性伪随机（石头/碎石纹理用）
  function texHash(a, b) {
    let h = (a * 374761393 + b * 668265263) & 0x7fffffff;
    h = (h ^ (h >> 13)) * 1274126177 & 0x7fffffff;
    return ((h ^ (h >> 16)) & 0xffff) / 0xffff;
  }

""" + t[i:i+0] + ""
t = t[:i] + mod_hash + t[i:]

# 把缓存块内所有 hash( 调用改成 texHash(
blk_start = t.find("    // ---------- 石块层（离屏缓存")
blk_end = t.find("    // 石头表面的小碎石", blk_start)
if blk_start > 0 and blk_end > blk_start:
    seg = t[blk_start:blk_end].replace("hash(", "texHash(")
    t = t[:blk_start] + seg + t[blk_end:]

# 小碎石段也改
peb_start = t.find("    // 石头表面的小碎石")
peb_end = t.find("    // 地表材质带", peb_start)
if peb_start > 0 and peb_end > peb_start:
    seg2 = t[peb_start:peb_end].replace("hash(", "texHash(")
    t = t[:peb_start] + seg2 + t[peb_end:]

p.write_text(t, encoding="utf-8")
print("hash → texHash 完成")

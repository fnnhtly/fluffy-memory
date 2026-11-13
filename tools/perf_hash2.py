"""把 hash 提升为模块级函数（彻底解决作用域问题）。

做法：在模块级定义 texHash，然后把块内和块外的 hash( 调用全部改成 texHash(。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 1) 删除块内的 hash 定义
start = t.find("    function hash(a, b) {")
assert start > 0, "hash def not found"
end = t.find("\n    }", start) + len("\n    }")
t = t[:start] + "    // 见模块级 texHash()" + t[end:]

# 2) 所有 hash( 调用 → texHash(
t = t.replace("hash(col", "texHash(col")
t = t.replace("hash(Math.floor", "texHash(Math.floor")
t = t.replace("hash(col * 7", "texHash(col * 7")

# 3) 在模块级插入 texHash
anchor = "  // ---------- 地形缓存（关卡不变就不重建） ----------"
if anchor not in t:
    anchor = "  let VIEW_W = DW, VIEW_H = DH;"
assert anchor in t, "module anchor not found"
mod = """  // 确定性伪随机（石头/碎石纹理用）
  function texHash(a, b) {
    let h = (a * 374761393 + b * 668265263) & 0x7fffffff;
    h = (h ^ (h >> 13)) * 1274126177 & 0x7fffffff;
    return ((h ^ (h >> 16)) & 0xffff) / 0xffff;
  }

""" + anchor
t = t.replace(anchor, mod, 1)

p.write_text(t, encoding="utf-8")
print("texHash 已提升为模块级")
print("剩余 hash( 调用:", t.count(" hash("))

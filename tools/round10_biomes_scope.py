"""把 BIOMES 从 drawWorld 内部提升为模块级常量，让 drawLevelThumb 等外部函数也能用。

做法：
1. 抠出 drawWorld 里的 `const BIOMES = {...};` 整块
2. 删掉它（drawWorld 内保留 `const PAL = ...`）
3. 在 drawWorld 之前以模块级 `const BIOMES = ...` 重新插入
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

start = t.find("    const BIOMES = {")
assert start > 0, "BIOMES not found"
# 找到对应的结束 `};`（在 PAL 之前）
pal_idx = t.find("    const PAL = BIOMES[", start)
assert pal_idx > start
end = pal_idx
block = t[start:end]                     # 包含 BIOMES 定义（不含 PAL 行）
# 去掉块前缩进 4 空格 → 模块级
mod_block = "\n".join(line[4:] if line.startswith("    ") else line for line in block.split("\n"))

# 1) 从 drawWorld 里删除
t = t[:start] + t[end:]

# 2) 插到 drawWorld 之前（模块级）
anchor = "  function drawWorld(ter, cam) {"
assert anchor in t
t = t.replace(anchor, mod_block.rstrip() + "\n\n" + anchor, 1)

p.write_text(t, encoding="utf-8")
print("BIOMES 已提升为模块级")

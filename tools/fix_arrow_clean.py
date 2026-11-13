"""彻底删除行驶阶段的箭头绘制段（而不是 if(false) 兜着）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

start = t.find("    // 推���方向箭头：行驶时不再显示")
if start < 0:
    # 用 ASCII 特征定位
    start = t.find("    if (false)\n    ordered_parts_for_arrows(car).forEach(p => {")
assert start > 0, "disabled block not found"

# 从注释行开始，删到 forEach 的结束 '});'
end_marker = "    });\n"
end = t.find(end_marker, start)
assert end > start
end += len(end_marker)

block = t[start:end]
t = t[:start] + t[end:]
p.write_text(t, encoding="utf-8")
print("已删除行驶阶段箭头段，长度", len(block))
print("剩余 if(false):", t.count("if (false)"))

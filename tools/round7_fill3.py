"""剩下 5 处全屏铺色统一改成 fillScreen。"""
import pathlib
import re

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

patterns = [
    (r"      ctx\.fillStyle = 'rgba\(8,14,10,\.58\)'; ctx\.fillRect\(0, 0, DW, DH\);",
     "      fillScreen('rgba(8,14,10,.58)');"),
    (r"    ctx\.fillStyle = 'rgba\(8,14,10,\.58\)'; ctx\.fillRect\(0, 0, DW, DH\);",
     "    fillScreen('rgba(8,14,10,.58)');"),
    (r"    ctx\.fillStyle = 'rgba\(6,12,16,\.82\)'; ctx\.fillRect\(0, 0, DW, DH\);",
     "    fillScreen('rgba(6,12,16,.82)');"),
    (r"    ctx\.fillStyle = 'rgba\(6,12,14,\.78\)'; ctx\.fillRect\(0, 0, DW, DH\);",
     "    fillScreen('rgba(6,12,14,.78)');"),
    (r"        ctx\.fillStyle = 'rgba\(232,200,122,\.08\)'; ctx\.fillRect\(0, 0, DW, DH\);",
     "        fillScreen('rgba(232,200,122,.08)');"),
]
for pat, rep in patterns:
    t2, n = re.subn(pat, rep, t)
    if n:
        t = t2
        print("  ok:", n, rep[:40])

# 1886 行：vg 那处（fillStyle = vg 换行 fillRect）
t = re.sub(r"(\n      ctx\.fillStyle = vg;\n      )ctx\.fillRect\(0, 0, DW, DH\);", r"\1fillScreen(vg);", t)

p.write_text(t, encoding="utf-8")
print("剩余:", t.count("fillRect(0, 0, DW, DH)"))

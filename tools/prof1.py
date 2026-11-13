"""给 drawWorld 的各阶段加计时埋点，找出真正最耗时的部分。

用全局 __prof 对象累计各阶段耗时（不改变渲染逻辑）。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 在 drawWorld 开头初始化 prof，各阶段前后打点
marks = [
    ("    // ---------- 天空/远山/丛林", "sky"),
    ("    // 远景地面过渡带", "sky2"),
    ("    // ---------- 地形：折线采样", "terrain"),
    ("    // ---------- 石块纹理", "stone"),
    ("    // 石头表面的小碎石", "pebble"),
    ("    // 草皮：暗边", "grass"),
    ("    // 零星草叶", "grass2"),
    ("    // 冰面", "ice"),
]

# 在 drawWorld 第一行后插入计时初始化
anchor = "  function drawWorld(ter, cam) {"
i = t.find(anchor)
assert i > 0
line_end = t.find("\n", i) + 1
init = """    // ---- 性能埋点 ----
    const __p = (window.__prof = window.__prof || {});
    let __t0 = performance.now();
    const __mark = (name) => {
      const now = performance.now();
      __p[name] = (__p[name] || 0) + (now - __t0);
      __t0 = now;
    };
"""
t = t[:line_end] + init + t[line_end:]

# 各阶段前插入 __mark
for anchor_txt, name in marks:
    idx = t.find(anchor_txt)
    if idx < 0:
        print("  MISS:", name)
        continue
    ls = t.rfind("\n", 0, idx) + 1
    t = t[:ls] + "    __mark('" + name + "');\n" + t[ls:]
    print("  ok:", name)

# drawWorld 结束前再 mark 一次（restore 之后）
end_anchor = "  function drawGrid() {"
j = t.find(end_anchor)
prev = t.rfind("\n  }", 0, j)
t = t[:prev] + "\n    __mark('end');" + t[prev:]

p.write_text(t, encoding="utf-8")
print("计时埋点已加")

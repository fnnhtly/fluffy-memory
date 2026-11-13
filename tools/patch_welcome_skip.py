"""给剩下四个测试脚本统一加"跳过欢迎页"（它们各自的 navigate 写法不同）。"""
import pathlib

TARGETS = ["shot_result.js", "test_brake.js", "test_eraser.js", "test_help_close.js"]

INJECT = (
    "  await send('Runtime.evaluate', { expression: \"localStorage.setItem('rap-welcomed-v1','1')\" });\n"
    "  await send('Page.navigate', { url: PAGE });\n"
    "  await sleep(1000);\n"
)

for name in TARGETS:
    p = pathlib.Path("tools") / name
    s = p.read_text(encoding="utf-8")
    if "rap-welcomed-v1" in s:
        print(name, "already handled")
        continue
    # 找第一个 Page.navigate 行，在其后注入
    idx = s.find("Page.navigate")
    if idx < 0:
        print(name, "NO NAVIGATE")
        continue
    line_end = s.find("\n", idx) + 1
    # 如果该行后面紧跟 sleep，也一并跳过
    s2 = s[:line_end] + INJECT + s[line_end:]
    p.write_text(s2, encoding="utf-8")
    print(name, "patched")

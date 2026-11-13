"""用正确的渲染后端重测帧率（去掉 --disable-gpu），建立真实基线。

并把所有测试脚本里的 --disable-gpu 去掉（它导致软件渲染，帧率虚低）。
"""
import pathlib
import re

tests = pathlib.Path("tools").glob("test_*.js")
count = 0
for p in tests:
    s = p.read_text(encoding="utf-8")
    if "'--disable-gpu'," in s or '"--disable-gpu",' in s:
        s = s.replace("'--disable-gpu',", "").replace('"--disable-gpu",', "")
        p.write_text(s, encoding="utf-8")
        count += 1
print(f"已从 {count} 个脚本移除 --disable-gpu")

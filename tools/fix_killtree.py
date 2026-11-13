# -*- coding: utf-8 -*-
"""把不走 A.finish 的审计脚本里的 `child.kill()` 改成杀进程树。

这些脚本（排版审计 / 对比度 / 缩略图 / 零件一览）自己 process.exit，
所以拿不到 asserts.finish 里的 killTree。它们在 verify 里跑 4 次，
每次留一棵 Edge 浏览器树在后台 —— 叠起来就是"跑一半开始超时"。
"""
import io, os, re

TARGETS = ['test_layout_audit.js', 'test_text_contrast.js',
           'test_level_thumbs.js', 'test_parts_page.js']
changed = []
for name in TARGETS:
    p = os.path.join('tools', name)
    with io.open(p, encoding='utf-8') as f:
        t = f.read()
    if 'killTree' in t:
        continue
    if 'child.kill()' not in t:
        print('skip (no child.kill):', name)
        continue
    # 加一条 require（脚本里可能已经有 asserts）
    if "require('./lib/asserts')" in t:
        t = t.replace("require('./lib/asserts')",
                      "require('./lib/asserts')", 1)
    else:
        # 在第一个 require 之后插入
        m = re.search(r"^const .*require\(.*\);$", t, re.M)
        if m:
            ins = m.end()
            t = t[:ins] + "\nconst A = require('./lib/asserts');" + t[ins:]
        else:
            raise SystemExit('no anchor in ' + name)
    t = t.replace('child.kill();', 'A.killTree(child);')
    with io.open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write(t)
    changed.append(name)

print('changed', changed)

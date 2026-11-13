# -*- coding: utf-8 -*-
"""把 tools/*.js 里写死的 CDP 端口改成随机端口。

原因：每个脚本都自己起一个 headless Edge 并写死 --remote-debugging-port。
verify 串行跑时不会撞，但一旦有残留进程 / 手动同时跑两个脚本，
就会连到别人的浏览器上，表现为"崩溃或超时"——这种红是假的，
而且看起来跟真回归一模一样，非常容易误导。
"""
import io, os, re

D = 'tools'
pat = re.compile(r'^const PORT = \d+;', re.M)
NEW = 'const PORT = 9400 + Math.floor(Math.random() * 400);   // 随机端口：避免残留进程撞车'

changed = []
for name in sorted(os.listdir(D)):
    if not name.endswith('.js'):
        continue
    p = os.path.join(D, name)
    with io.open(p, encoding='utf-8') as f:
        t = f.read()
    if not pat.search(t):
        continue
    t2 = pat.sub(NEW, t, count=1)
    # PORT 在 const 之前必须没被用来拼字符串（本仓库没有这种用法）
    with io.open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write(t2)
    changed.append(name)

print('changed', len(changed))
print('\n'.join(changed))

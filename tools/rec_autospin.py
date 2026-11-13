import pathlib

q = pathlib.Path("records/playtest.md")
r = q.read_text(encoding="utf-8")
add = """## 2026-11-13 · 用户报的真实 bug：打气筒长按一直旋转（runtime=html，执行者：Agent）

**用户反馈**：「打气筒为什么左键长按会一直旋转，不应该是点一下转一下吗」

### 根因（这是个很隐蔽的架构问题）

1. `tryPlace()` 对"已放置的同款方向件"会执行 `dir = (dir + 1) % 4`（实现"再点一次换方向"）
2. 但渲染层的**吸附高亮**和**悬停红叉预览**，是**每帧**调用 `tryPlace()` 来探测"这格能不能放"
3. → 鼠标悬停在打气筒上时，每帧转 90°，按住不松就**一直旋转**

也就是说：**用来"问一个问题"的函数，偷偷改了答案**。

### 修法：把查询和命令分开（CQRS 思路）

| 函数 | 职责 | 副作用 |
|---|---|---|
| `canPlace(level, build, part, r, c)` | 只回答"能不能放 / 会不会转" | **无** |
| `tryPlace(...)` | 先 `canPlace`，再写数据 | 有 |

渲染层两处探测改用 `canPlace`，删掉了原来那段"探测后手动撤回"的补丁代码。

### 修复过程中又踩了一个坑

重写 `canPlace` 时漏了「**结构件（木框）可以当起点自由放置**」这条特判，
导致第一块木框就被 `connect` 拒绝 → 34/34 全线崩溃（`reason=empty`）。
补上 `if (PARTS[part].structure) return { ok: true }` 后恢复全绿。

### 验证（`tools/test_no_autospin.js`）

```
按下前 dir = 0
按住期间采样 = 0,0,0,0,0,0,0,0,0,0,0,0   ← 不再自动旋转
松开后 dir = 1                            ← 只转一次
单击再点 dir = 2                          ← "点一下转一下"
PASS
```

回归：34/34 + **九个**自动化脚本 0 异常。

"""
marker = "## 已知弱点（如实记录）"
assert marker in r
r = r.replace(marker, add + marker)
q.write_text(r, encoding="utf-8")
print("记录已补")

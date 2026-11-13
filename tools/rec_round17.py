import pathlib

q = pathlib.Path("records/playtest.md")
r = q.read_text(encoding="utf-8")
add = """## 2026-11-13 · 第 17 轮：一键自检 + 轮子频闪修复（runtime=html，执行者：Agent）

### 新增 `tools/verify.mjs`（一键跑完全部自检）

```bash
node tools/verify.mjs          # 全量：15 项，约 2.5 分钟
node tools/verify.mjs --fast   # 只跑数值 + 语法，约 0.3 秒
```

汇总输出（实测）：

```
✓ 数值校核 34 项        235ms  PASS 34 / FAIL 0
✓ 内联脚本语法          192ms  OK
✓ test_eraser ~ test_wheel_spin（13 个浏览器脚本）
全部通过（15 项）
```

退出码 0/1，可直接接进提交流程。

### 修了一个"看不出来"的动态 bug：轮子频闪

**发现过程**：写探测脚本算轮子每帧转角 → 12 m/s 时每帧 5.9°。
轮子 6 根辐条、周期 60°，**5.9° 和 60° 几乎对齐** → 高速时辐条位置几乎重合 → **轮子看起来是静止的**。

| 项 | 之前 | 现在 |
|---|---|---|
| 辐条数 | 6（周期 60°） | **5**（周期 72°，避开 5.9° 的对齐） |
| 旋转对称性 | 完全对称 | 加**偏心配重块** + **单侧亮片**，打破对称 |

**验证方式**：`tools/test_wheel_spin.js` 在高速下连续抓 4 帧（每帧推进 1/60 秒的里程），
比较整图哈希 —— 4 帧全不相同 = 轮子确实在动：

```
4 帧哈希: 8ffcf81f3b45 eb0d081568e6 d51b3456b032 108795905704
PASS：每帧都不一样（轮子看得出在转）
```

这个 bug 静态截图 100% 看不出来，只有算出来 + 连续帧对比才能发现。

回归：`verify.mjs` **15/15 全部通过**；`shot-diff` 7/7 全部变化。

"""
marker = "## 已知弱点（如实记录）"
assert marker in r
r = r.replace(marker, add + marker)
q.write_text(r, encoding="utf-8")
print("记录已补")

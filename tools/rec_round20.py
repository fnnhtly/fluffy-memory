import pathlib

q = pathlib.Path("records/playtest.md")
r = q.read_text(encoding="utf-8")
add = """## 2026-11-13 · 第 20 轮：性能优化（含一次严重事故与恢复）（runtime=html，执行者：Agent）

### 发现：帧率只有 13.8 fps

写 `test_perf.js` 用 rAF 计数器测帧率 → **13.8 fps**，远低于 60fps 标准。

逐层定位：
1. 关粒子 → 11.2 fps（无改善）
2. 缩小画布到 640×360 → 10.8 fps（无改善）
   → **不是 GPU 填充，是 CPU 绘制调用太多**
3. 估算每帧调用：石头 240 块 × 5 次 ≈ **1200 次**（占 80%）

### 成功的优化（最终保留）

| 优化 | 效果 |
|---|---|
| **地形缓存**（makeTerrain 每帧重建 → 只建一次） | 最有效的单项 |
| 石头尺寸 78×52 → **108×72**（块数减 40%） | |
| 去掉每块石头的"受光边"描边 | |
| DPR 上限 2 → **1.5** | 4K 屏别画 2 倍 |

**13.8 → 24.8 fps（1.8 倍）**

### 失败的尝试（已全部回滚）

想把石头/天空层缓存到离屏 canvas（`ctx = stoneCtx` 切换）：
- 第一次：`Assignment to constant variable`（`ctx` 是 `const`）
- 改成 `let` 后：`hash is not defined`（hash 定义在被移走的块里）
- 提升 hash 后：**HUD 变半透明**（`ctx.save/restore` 栈被跨对象打乱，
  save 33 次 / restore 34 次，不平衡）
- 回滚过程中又误删了 `traceTerrain` 和整段地形绘制 → **画面空白**

**教训：临时切换全局 `ctx` 对象来"借用"绘制代码，是错误的架构。**
`ctx` 是状态机，save/restore 栈必须连续。要缓存，必须把绘制代码抽成参数化函数
（`paint(ctx, ...)`），而不是靠切换全局变量。

### 恢复过程（值得记录）

1. **发现没有版本控制** → 立即 `git init` + 提交当时（已损坏）的快照
2. 从 git 快照里提取出原始石块代码，反缩进后重新插入
3. 逐个修：`traceTerrain` 缺失 → 补地形折线段；`stoneW` 重复声明 → 删残留块；多余大括号 → 定位后删除

**最重要的一条**：`errors: (none)` **不等于画面正常**。
安全网接住异常后测试仍然"通过"，但画面可能是坏的（本轮就出现过画面全白但 17 项全绿）。
**必须每次看截图。**

### 本轮新增基建
- `git` 版本控制（之前 20 轮都没有，这次事故直接证明了必要性）
- `test_perf.js`：帧率 + 数组长度监测

回归：`verify.mjs` **17/17 全部通过**；帧率 24.8 fps。

"""
marker = "## 已知弱点（如实记录）"
assert marker in r
r = r.replace(marker, add + marker)
q.write_text(r, encoding="utf-8")
print("记录已补")

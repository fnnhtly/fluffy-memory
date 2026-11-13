import pathlib

q = pathlib.Path("records/playtest.md")
r = q.read_text(encoding="utf-8")
add = """## 2026-11-13 · 箭头只在建造且选中时显示（runtime=html，执行者：Agent）

**用户要求**：「打气筒这类零件只在建造且选中的时候露出箭头指明方向」

### 新的显示规则

| 场景 | 箭头 |
|---|---|
| 建造阶段 + **选中的是该款零件** | ✓ 显示全部同款零件的箭头（含长度、喷气短线、实心三角） |
| 建造阶段 + 选中别的零件 | ✗ 只有一个小小的白点表示朝向（保留"这里有方向件"的可读性） |
| 建造阶段 + 鼠标**悬停**某格 | ✓ 该格显示加亮箭头 + 「上/下/左/右」文字 |
| **行驶阶段** | ✗ **完全不画**（原来画了，很干扰画面） |

### 实现要点
1. 建造阶段判定从"所有方向件"改成 `state.selected === cell.part || isHover`
2. 行驶阶段整段箭头绘制代码**直接删掉**（第一次用 `if (false)` 兜着，后来清理干净了）
3. 未选中时画 0.07×BUILD_PX 半径的小白点，不带箭头

### 验证（`tools/test_arrow_visibility.js`）

- `av-01-not-selected.png`：选中木框 → 两个打气筒只有白点，无箭头
- `av-02-selected-pump.png`：选中打气筒 → 两个打气筒都显示箭头
- `av-03-hover.png`：悬停 → 该格加亮 + 方向文字

回归：34/34 + **十个**自动化脚本 0 异常。

"""
marker = "## 已知弱点（如实记录）"
assert marker in r
r = r.replace(marker, add + marker)
q.write_text(r, encoding="utf-8")
print("记录已补")

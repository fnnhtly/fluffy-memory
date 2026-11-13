import pathlib

q = pathlib.Path("records/playtest.md")
r = q.read_text(encoding="utf-8")
add = """## 2026-11-13 · 第 15 轮：完整流程走查 + 可读性修复（runtime=html，执行者：Agent）

这轮不加新功能，而是**从头到尾走一遍真实玩家流程**，找流程上的卡点。

### 新增 `tools/test_fullplay.js`（端到端流程测试）

用全新浏览器 profile（清空 localStorage）+ 真实鼠标，走完：

```
1) 欢迎页 welcome = 1
2) 翻完 welcome = 0 | 已标记 = 1
   入场镜头 introT = 1.00
3) 建车 cells = 5 格
4) 发射 phase = run
5) 结算 = 到达 | stars=2 | 新纪录=true
6) 下一关 levelIndex = 1 phase = build
```

**全流程无卡点、0 异常、44 秒内走完一关并进入下一关。**

### 从截图里发现的两个可读性问题（已修）

| 问题 | 原因 | 修法 |
|---|---|---|
| 左侧三个圆钮的标签被圆钮本体压住（"清空 C"只露半个字） | 竖排圆钮 + 下方标签，56px 钮高一定挤 | 改成**横向胶囊**：圆钮在左、文字在右 |
| 底部操作提示在草地/岩石上几乎看不见 | 半透明白字直接压在地形上 | 加**深色底衬**（自动按文字宽度） |

修复后左侧变成「⛔ 清空 C」「↺ 撤销 Z」「↻ 换方向 R」三颗清晰的胶囊按钮。

回归：34/34 + **十一个**自动化脚本 0 异常。

"""
marker = "## 已知弱点（如实记录）"
assert marker in r
r = r.replace(marker, add + marker)
q.write_text(r, encoding="utf-8")
print("记录已补")

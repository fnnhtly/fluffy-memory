import pathlib

q = pathlib.Path("records/playtest.md")
r = q.read_text(encoding="utf-8")
add = """## 2026-11-13 · 第 10 轮：选关页地形缩略图（runtime=html，执行者：Agent）

每张关卡卡片底部加**真实地形剖面缩略图**：直接读 `mapRows` 算出每列最高实体行，
压成 44px 高的折线，配色用该关的 biome 岩石色，并标出**绿点起点 / 红旗终点**。

一眼能看出：
- 1-1 原野长缓坡
- 1-2 峡谷有台阶
- 1-3 洞窟超长平路
- 1-4 冰原有大上坡（蓝白配色）
- 1-5 黄昏有深沟

![选关页缩略图](workspace/roll-away-pig/records/shots/ls-04-thumb.png)

### 这轮连踩三个"改了但没生效"的坑

| # | 现象 | 原因 |
|---|---|---|
| 1 | 缩略图不显示 | `BIOMES` 定义在 `drawWorld` **函数内部**，`drawLevelThumb` 访问不到 → 抛错（被安全网接住但没人看） → **提升为模块级常量** |
| 2 | 插入代码没生效 | Python 脚本用长字符串匹配失败后**只打印"已存在"**，实际什么都没做 |
| 3 | 又没生效 | 匹配串和文件里的实际文本有细微差异（缩进/文字） |

**教训**：改渲染代码后必须**截图确认**，不能只看 `node --check` 通过就认为改好了。
后两次改成"按行号定位插入"才成功。

回归：34/34 + 七个脚本 0 异常。

"""
marker = "## 已知弱点（如实记录）"
assert marker in r
r = r.replace(marker, add + marker)
q.write_text(r, encoding="utf-8")
print("记录已补")

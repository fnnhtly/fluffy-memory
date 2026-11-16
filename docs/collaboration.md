# 协作须知（给多人一起改这个项目的人）

> 这份文档只讲**怎么一起改不出事**。玩法、美术、关卡设计分别看
> `docs/gdd.md`、`docs/art-bible.md`、`levels/*.json`。

## 0. 三分钟上手

```bash
git clone https://github.com/fnnhtly/fluffy-memory.git roll-away-pig
cd roll-away-pig
# 不用 npm install —— 这个项目零依赖
双击 prototype/index.html          # 就能玩
node prototype/check_html_logic.js # 40 项数值校核，2 秒
node tools/verify.mjs              # 全量回归，约 8 分钟（会开真实 Edge）
```

跑 `verify.mjs` 需要本机装了 Edge（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`）。
别的浏览器也能玩，但**测试脚本里写死了 Edge 的路径**，换浏览器要改那一行。

## 1. 谁改哪里（避免同一条街撞车）

这个仓库目前按"文件族"分工最省事，因为耦合点很少：

| 你想改 | 动的文件 | 别动 |
|---|---|---|
| 物理手感、零件数值、关卡记账 | `prototype/game.js` | `index.html` 的绘制部分 |
| 画面、UI、输入、演出 | `prototype/index.html` | `game.js` 的 `Params` |
| 关卡形状、零件配给 | `levels/*.json` → 跑 `node tools/build_levels_js.js` | 手改 `prototype/levels.js` |
| 测试与量具 | `tools/test_*.js`、`tools/lib/*` | 产品文件 |
| 文档、试玩记录 | `docs/*.md`、`records/playtest.md` | — |

**唯一的硬耦合**：`index.html` 里凡是读 `RAP.xxx` 的地方，都对应 `game.js` 的导出。
改 `game.js` 的函数签名或返回值，一定要 grep 一遍 `index.html` 的用法。

## 2. 五条必须遵守的规矩（都是踩出来的）

### 2.1 含中文的文件不要用 PowerShell 改
`Set-Content` / `-replace` / `Out-File` 会把 UTF-8 中文写成乱码 + BOM。
本项目已经因此毁过 `game.js`、`index.html`、`levels.js`、`docs/*.md`、`tools/*.js`。
用编辑器、用 `edit`/`write` 工具、或者 `git checkout --` 回滚后重改。

### 2.2 几何只有一个来源
按钮矩形、托盘槽位、网格格边长**不许**在测试里另抄一份公式。

- 按钮 → `btnRect(name)` / `observeBtnRect()` / `trayRect(i)`
- 网格 → `buildOrigin()` 返回 `{x, y, px}`，`buildCellPx()` 返回 `px`
- 零件说明页行高 → `state.partsPageRows` / `state.partsPageRowH`

正确写法（`tools/test_eraser.js` 是范例）：

```js
const BP = await ev('window.__rap.BUILD_PX');
const OR = JSON.parse(await ev('JSON.stringify(window.__rap.buildOrigin())'));
const cell = (r, c) => ({ x: OR.x + c*BP + BP/2, y: OR.y + r*BP + BP/2 });
```

抄公式的下场有先例：`test_parts_page` 硬编码行高，界面一改就报「留白 -90px」，
而界面其实是对的。

### 2.3 每条断言都要能变红
新写的断言，先把它测的那行代码**改回错的**，跑一次，确认它真的失败，再恢复。
做不到这一点的断言就是一句永远为真的空话，比没有更糟（它给人虚假的安全感）。

现成的例子：
- `tools/test_no_black_block.js`：修复前的代码读数 0.813，修复后 1.233，阈值卡在中间。
- `tools/test_world_anchor.js`：`tools/_redproof_anchor.js` 一键把 `buildOrigin`
  换回旧常量版，A2/C1/C2 立刻红（4/7），恢复后 7/7。

### 2.4 被测量对象死了，测试要一起埋
刹车键被删了 → 它的测试也删/改写，而不是留一条永远为真的。
`tools/lib/verdict.js` 要求 `ASSERTS n / n` 全过且 `errors: (none)`，
但这个规则挡不住"断言本身是空的"——那只能靠 2.3 的人为纪律。

### 2.5 提交信息写"改之前哪里是坏的"
不要写 `update` / `fix bug`。看历史就知道标准：

```
round63: the car was a pile of parts, not a car
round64: the build area was nailed to the screen, so the car appeared somewhere else on the map
round64b: the build grid slid under the toolbar, so placing a part hit 'undo'
```

第一行说清**症状**，正文说清**根因 + 改法 + 验证数字**。

## 3. 容易踩的坑（无头浏览器专用）

写测试时会碰到，全是实测出来的：

| 坑 | 表现 | 对策 |
|---|---|---|
| `state.paused` 会盖一层暗色 | 像素读数被压平，"修复前后无差别" | 测量前确认没暂停，或读 `state.shakePeak` 这类极值字段 |
| 画布不是 1280×720 | 无头里实际是 1254×707，dpr 0.98 左右 | 用 `window.__view` 读真实尺寸，别假设 |
| `getImageData` 用设备像素 | 直接按设计坐标取会取错位置 | 乘 `cv.width/1280` |
| `AudioContext` 永远 `suspended` | `await ac.resume()` 永不 resolve，测试挂死 | **绝不 await**；静音靠数"建了几个振荡器"来验 |
| CDP 键名要全大小写 | `'esc'` 无效，要 `'Escape'`；字母还要 `windowsVirtualKeyCode` | 照抄现有脚本里的写法 |
| `window.__rap` 在解析完成前不存在 | 早跑会 `undefined` | 导航后 `sleep(1000+)` |

## 4. 改动流程建议

1. 开一个分支：`git checkout -b feat/你的名字-要做什么`
2. 小步提交，每条提交自身可运行（`check_html_logic` 绿）
3. 推送前跑 `node tools/verify.mjs`，别把红的传上去
4. 开 PR 时贴：**改前哪里坏** / **怎么证明修好了** / **哪些数字**
5. 关卡数据改完记得 `node tools/build_levels_js.js`（它会拒收脏字段）

## 5. 目前的已知状态

- `node prototype/check_html_logic.js` → **40/40 绿**
- `node tools/verify.mjs` → 75 项；`test_world_anchor` 加入后，
  仍有一批测试在用旧布局坐标，正在修（见 PR/issue）
- 步骤 5（Lua 实现）尚未开始，HTML 原型还在打磨

## 6. 找谁问

先看 `records/playtest.md`（2397 行）：几乎每个"为什么这里要这么写"
在里面都有当时的原因、实测数字和失败过的方案。搜轮次号或关键字，
通常比问人快。

"""第 32 轮：把 13 个「只打印不判定」的回归脚本改成真断言，并把判定规则本身抽出来验证。"""
import io
import re
import sys

PATH = r"records/playtest.md"

ROUND = """## 第 32 轮 · 让回归真的能失败

第 31 轮末尾我发现了一件比任何画面 bug 都更糟的事：`tools/` 下 27 个 test 脚本里，
有 15 个的结尾是 `out.push('xxx = ' + value)` 然后 `process.exit(0)`，
而 `verify.mjs` 只 grep 一行 `errors: (none)`。也就是说——
**车一动不动、按钮一个没点上、场景完全没发生，回归依然全绿。**
上一轮我改了四个（fullplay / brake / help_close / levelselect），
这一轮把剩下的全部改完，并且连"什么算通过"这条规则也证明了一遍。

### 这一轮改的脚本（每个都要能失败）

| 脚本 | 原来的"通过" | 现在的判据 |
|---|---|---|
| `test_welcome.js` | 打印 3 张截图 | 三页能翻完 + 第 2 页卡片确实更高（306→380）+ 按钮不出屏 + 写 localStorage + 刷新不再弹 + 点卡外空白不误关 |
| `test_intro.js` | 打印 `introT` 最终值 | 连续采样 (introT, zoom)，证明**采到过广角**、之后单调收窄、终点 2.10、推完不漂 |
| `test_no_autospin.js` | 打印 `allSame ? PASS : FAIL` | 长按 1.2s × 12 次采样方向不变；一次完整点击恰好 +1；4 次绕回原方向 |
| `test_arrow_visibility.js` | 打印 3 张截图 | 结构层 `arrowDrawN` + 视觉层"格心外环带"A/B 像素差（相机静止，变化只能来自箭头） |
| `test_eraser.js` | 打印 cells 字符串 | 拖动擦除掉目标格 + 擦完还能继续建造 + `frameCount` 继续增长（rAF 没被打死） |
| `test_pig_mood.js` | 打印见过的表情 | 跑完一关必须见到 normal；再手动构造 hurt / dead 两条"输"的视觉线索 |
| `test_touch_fx.js` | 打印级别分布 | 有 Lv≥1 就必须真的出尘土；有 Lv≥2 就必须真的震屏 |
| `test_touch_all.js` | 打印级别分布 | 3 米落差必须能触到 Lv≥3，且尘土 ≥6、震屏 >0.05（高级别不是死数据） |
| `test_replay.js` | 打印 failReason | 脆车必须 fail、有 failReason、回放帧 >5、`replayT` 在推进、结束后不跳走 |
| `test_resolutions.js` | 打印 canvas 尺寸 | 5 种画布下宽高比不拉伸 + 设计区 1280×720 完整可见 + 13 个 UI 锚点全在设计区内 |
| `test_wheel_spin.js` | 4 帧哈希不同 | 轮子矩形内：只改 odo 必须大幅变化；整圈 12 个角度两两不同；360° 变化远小于 180° |
| `test_drive_sequence.js` | 打印 14 帧状态 | 位移 >3 米、\|vx\| 峰值 >1、镜头跟随 >2 米、判定 win、结算位置距终点 <3 米 |
| `test_fullplay.js` / `test_help_pause.js` / `test_run_banner.js` | 自带 `ALL PASS` 行 | 统一改成公共断言器的 `ASSERTS n / n` 格式 |

### 判定规则也抽出来自证了

新增 `tools/lib/verdict.js` + `tools/selftest_verdict.js`（8 项）。
规则三条缺一不可：退出码 0 / `errors: (none)` / **打出 `ASSERTS n / n` 且 n>0 且相等**。
自检里最后一条专门写反例：同一段"假绿"输出，旧规则（只 grep errors）放过，新规则抓住。

`verify.mjs` 现在 28 项，其中 17 个交互脚本全部走 `verdict()`。

### 这一轮踩到的三个新坑（都是"测量本身不可靠"）

1. **`state.cam` 是每帧新建的对象**。`buildCam()` 每次返回新对象，`state.cam` 这个字段
   从头到尾就没人写过——测试读到的永远是初始值 2.1。
   推镜逻辑改的是 `frameBody` 里的局部变量 `cam`。
   修法：在 `frameBody` 里加 `state.camLive = {x,y,zoom}`，记录"这一帧真正用的镜头"。
   这件事说明：**测试读的状态必须是渲染真正用的那个对象**，否则读得再像也没用。

2. **CDP 往返与 rAF 的次序不可控**。第一版 `test_intro` 取"开始前"快照时，
   有一次取到 `introT=0.72 / zoom=2.07` —— 推镜早就跑完了。
   修法：改成连续采样序列，用"采到的最广视野"当起点，判据是
   "广角出现在前半段 + 过最广点后单调收窄"。这也顺带证明推镜的**方向**是对的。

3. **整帧哈希永远不可能相等**。`test_wheel_spin` 想先证明"暂停后画面静止"，
   结果两次截图永远不同。查下来：小猪每 3.6 秒眨一次眼（`tNow % 3.6 > 3.45`）、
   出发钮有 `sin(performance.now()/300)` 呼吸圈、高速时有 `performance.now()` 驱动的速度线。
   **它们都不受 `paused` 影响，这是合理的**（环境动效），但意味着不能拿整帧做差。
   修法：只框住轮子自己那块矩形，并先量一份"什么都不改时的噪声"当基线
   （实测 0~10 像素），再拿真实变化（711 像素）去比。
   顺带发现第一版的"哈希"（每 13 字节取样求和）在同一张图上会撞成 1/12，
   换成双路滚动乘法后 12/12 唯一。

### 现在的结果

`node tools/verify.mjs` → **28 项全绿**，17 个交互脚本合计 **151 条断言**。
其中每一条都至少被"故意弄坏一次"验证过会红（见上表右列的判据来源）。

### 仍然诚实的短板

- 还是没在真机上跑过（步骤 7 未开始）。
- Lua 版一行没写（步骤 5）。
- 音频是 WebAudio 合成的，没有素材。
"""


def main():
    with io.open(PATH, "r", encoding="utf-8") as f:
        text = f.read()
    anchor = "## 已知弱点"
    if anchor not in text:
        print("anchor not found", file=sys.stderr)
        return 1
    if "第 32 轮" in text:
        print("round 32 already recorded", file=sys.stderr)
        return 1
    i = text.index(anchor)
    text = text[:i] + ROUND + "\n" + text[i:]
    with io.open(PATH, "w", encoding="utf-8") as f:
        f.write(text)
    print("ok, lines =", text.count("\n") + 1)
    return 0


if __name__ == "__main__":
    sys.exit(main())

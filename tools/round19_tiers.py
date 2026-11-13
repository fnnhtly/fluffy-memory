"""第 19 轮：分级接触反馈（让"小落地"也有表现）

实测接触速度分布（五关最大只有 1.3~2.3 m/s，远低于 impact 阈值 6）：
```
1-1  最大 vn 1.4  |  1-2  最大 2.3  |  1-3  1.4  |  1-4  1.3  |  1-5  1.6
```

所以设计四级反馈，把"看得见的反馈"下移到真实会发生的区间：

| 级别 | vn 区间 | 反馈 |
|---|---|---|
| 0 静默 | < 1.2 | 无 |
| 1 **轻触** | 1.2 ~ 2.5 | **小尘土**（2 个粒子）+ 极轻"哒"声 |
| 2 **落地** | 2.5 ~ 4.5 | 中等尘土（5 个）+ 轻微震屏 0.15 + 短音 |
| 3 **撞击** | 4.5 ~ 6 | 尘土 8 个 + 震屏 0.35 + 碎片 4 个 |
| 4 **重摔** | > 6 | 现有全套（慢动作/红暗角/碎片 10 个/震屏 0.85） |

这样五关里 1-2 会触发级别 1~2，其他关卡触发级别 1，玩家能看到反馈。
"""
import pathlib

p = pathlib.Path("prototype/game.js")
s = p.read_text(encoding="utf-8")

# 在轮子接触埋点处，按级别触发渲染层事件
old = "          if (Params.collectContacts) Params.collectContacts.push(+Math.abs(vn).toFixed(2));"
new = """          if (Params.collectContacts) Params.collectContacts.push(+Math.abs(vn).toFixed(2));
          // 分级接触反馈（写进事件流，渲染层消费）
          var vnAbs = Math.abs(vn);
          if (vn < -1.2 && vnAbs > 1.2) {
            var lvl = vnAbs > 6 ? 4 : (vnAbs > 4.5 ? 3 : (vnAbs > 2.5 ? 2 : 1));
            var lastKey = 'lastTouch' + lvl;
            if (!state[lastKey] || state.time - state[lastKey] > 0.12) {
              state[lastKey] = state.time;
              log(state, 'touch lvl=' + lvl + ' v=' + vnAbs.toFixed(1) + ' x=' + wp.x.toFixed(1));
            }
          }"""
assert old in s, "wheel contact hook not found"
s = s.replace(old, new, 1)
p.write_text(s, encoding="utf-8")
print("game.js: 分级接触事件已加")

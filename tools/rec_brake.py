import pathlib

q = pathlib.Path("records/playtest.md")
r = q.read_text(encoding="utf-8")
add = """## 2026-04-19 · 摩擦第四轮：加刹车（runtime=html，执行者：Agent）

用户第三次说"木框摩擦还是低"。被动摩擦已到极限：滚阻再往上提（0.16）时，
1-1 的车在出生 2 m 内就停死、1-4 上不了冰坡 —— 五关全部不可解。
所以改成**主动刹车**：

- 行驶界面右下角 **「刹 / 按住」红钮**，按住 = 轮子抓地 ×1.6 + 9 m/s² 减速度；
- 键盘 `↓` / `S` 同样；
- 实测：平地 5 m/s 松手滑 **34.07 m / 8.02 s**；按住刹车 **2.82 m / 1.03 s**。

被动摩擦基线（保持可解）：滚阻 0.06（低速 <3 m/s 时 0.14）、抓地 1.2、
车壳低速 0.5 / 高速 0.12、蠕行刹车 <1.5 m/s。

代价：1-2 重排成"短关 + 终点前一道 1 m 台阶"（终点 12、木箱 8）。34/34 全绿。

"""
marker = "## 已知弱点（如实记录）"
assert marker in r
r = r.replace(marker, add + marker)
q.write_text(r, encoding="utf-8")
print("playtest record appended")

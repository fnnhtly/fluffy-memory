"""给"方向 + 箭头"补数值断言：
1) 再点一次已放的方向件会切换朝向（而不是报"格子已占用"）
2) 打气筒的冲量方向跟着朝向走（朝上 → vy>0）
"""
import pathlib

c = pathlib.Path("prototype/check_html_logic.js")
s = c.read_text(encoding="utf-8")

s = s.replace("// ---------------- 发射守卫 ----------------",
"""// ---------------- 方向件：切换方向 + 冲量跟随朝向 ----------------
{
  RAP.resetParams();
  const lv = byId['1-2'];
  const b = RAP.newBuild();
  RAP.tryPlace(lv, b, 'wood_frame', 4, 2);
  RAP.tryPlace(lv, b, 'wood_wheel', 5, 2);
  RAP.tryPlace(lv, b, 'pig', 4, 2);
  const first = RAP.tryPlace(lv, b, 'pump', 3, 2);
  ok('打气筒默认朝向 0（向右）', first.ok && b.cells['3,2'].dir === 0, JSON.stringify(b.cells['3,2']));
  const rot = RAP.tryPlace(lv, b, 'pump', 3, 2);
  ok('再点一次已放的方向件 → 切换朝向（不报占用）',
    rot.ok && rot.rotated === true && b.cells['3,2'].dir === 1, JSON.stringify(rot));
  RAP.tryPlace(lv, b, 'pump', 3, 2);
  RAP.tryPlace(lv, b, 'pump', 3, 2);
  ok('再点两次 → 朝向转回 3（向下）', b.cells['3,2'].dir === 3, 'dir=' + b.cells['3,2'].dir);
  RAP.rotateAt(b, 3, 2);            // 转回 0
  RAP.rotateAt(b, 3, 2);            // 1 = 向上

  const st = RAP.createRun(lv, b);
  for (let i = 0; i < 12; i++) RAP.step(st, 1 / 60);
  const vy0 = st.car.vy;
  RAP.pressInteract(st, 1);
  for (let i = 0; i < 36; i++) RAP.step(st, 1 / 60);   // 按住蓄力
  RAP.releaseInteract(st, 1);
  const vy1 = st.car.vy;
  ok('打气筒朝上时释放 → 得到向上的速度',
    vy1 > vy0 + 0.4, 'vy0=' + vy0.toFixed(2) + ' vy1=' + vy1.toFixed(2));
}

// ---------------- 发射守卫 ----------------""")
c.write_text(s, encoding="utf-8")
print("自检：方向断言 4 条")

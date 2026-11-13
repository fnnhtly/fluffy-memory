"""视觉第四遍（小修）：
1) 猪坐在车体里（跟车一起旋转），不再浮在车上方
2) 去掉右下角那块大红「重开」按钮（左上已有绿色重开圆钮）
3) 草皮下面加一道明显的黑描边（参考里草和岩石间有一条很重的暗线）
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 1) 猪跟着车体
old = """    // 猪（画在车体上方，带表情）
    const pp = worldToScreen(car.x, car.y + 0.6, cam);
    const r = PPM * cam.zoom * 0.42;
    ctx.fillStyle = COL.pig; ctx.beginPath(); ctx.arc(pp.x, pp.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#22331f';
    ctx.beginPath(); ctx.arc(pp.x - r * 0.35, pp.y - r * 0.2, r * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(pp.x + r * 0.35, pp.y - r * 0.2, r * 0.13, 0, Math.PI * 2); ctx.fill();"""
new = """    // 猪：坐在车体里（跟着车体旋转）
    const pigLocalY = 0.15;
    const pp = worldToScreen(
      car.x + 0 * ca - pigLocalY * sa,
      car.y + 0 * sa + pigLocalY * ca, cam);
    drawPig(pp.x, pp.y, PPM * cam.zoom * 0.36, -car.a);"""
assert old in t
t = t.replace(old, new)

# 2) 去掉右下角大红重开
old_btn = """      const r2 = btnRect('retryRun');
      ctx.fillStyle = '#e0513c'; roundRect(r2.x, r2.y, r2.w, r2.h, 12); ctx.fill();
      text('重开', r2.x + r2.w / 2, r2.y + r2.h / 2 + 5, 14, '#fff', 'center');"""
new_btn = """      // 重开在左上（drawHud 里的绿色圆钮），这里不再放重复按钮"""
assert old_btn in t
t = t.replace(old_btn, new_btn)

# 3) 草皮描边更重
t = t.replace("    band('rgba(24,34,28,.85)', 3 * cam.zoom, 17 * cam.zoom); // 描边",
              "    band('rgba(18,26,22,.95)', 7 * cam.zoom, 19 * cam.zoom); // 重描边")

p.write_text(t, encoding="utf-8")
print("index.html: 视觉第四遍完成")

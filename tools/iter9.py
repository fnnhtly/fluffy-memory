"""渲染侧配合"中空木框 + 内嵌小猪"：
- 木框画成四条边框 + 内部挖空（能看到后面）
- 框里的小猪按 0.62 倍画在格心，随车体旋转
- 建造界面先画框再画 inner，保证猪在框内
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 木框：中空（四条边）
old = """    if (def.structure) {
      // 木板：底色 + 木纹 + 深色描边
      ctx.fillStyle = def.color; roundRect(-h, -h, size, size, 3); ctx.fill();
      ctx.strokeStyle = COL.woodDark; ctx.lineWidth = Math.max(1.5, size * 0.06); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,80,40,.45)'; ctx.lineWidth = Math.max(1, size * 0.045);
      ctx.beginPath();
      ctx.moveTo(-h + size * 0.12, -h * 0.33); ctx.lineTo(h - size * 0.12, -h * 0.33);
      ctx.moveTo(-h + size * 0.12, h * 0.33); ctx.lineTo(h - size * 0.12, h * 0.33);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,235,200,.18)';
      ctx.fillRect(-h + size * 0.1, -h + size * 0.1, size * 0.8, size * 0.12);
      // 挂点夹子（参考里木框上的红黑小夹子）
      for (const dx of [-h * 0.62, h * 0.62]) {
        ctx.fillStyle = '#2b2f36';
        roundRect(dx - size * 0.09, -h * 0.16, size * 0.18, size * 0.32, 2); ctx.fill();
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.arc(dx, -h * 0.16, size * 0.07, 0, Math.PI * 2); ctx.fill();
      }
    } else if (def.wheel) {"""
new = """    if (def.structure) {
      // 中空木框：四条边（中间是空的，角色可以放进去）
      const bw = size * 0.22;                        // 边框宽度
      ctx.fillStyle = def.color;
      ctx.fillRect(-h, -h, size, bw);                 // 上
      ctx.fillRect(-h, h - bw, size, bw);             // 下
      ctx.fillRect(-h, -h, bw, size);                 // 左
      ctx.fillRect(h - bw, -h, bw, size);             // 右
      // 木纹
      ctx.strokeStyle = 'rgba(120,80,40,.5)'; ctx.lineWidth = Math.max(1, size * 0.04);
      ctx.beginPath();
      ctx.moveTo(-h + bw, -h + bw * 0.5); ctx.lineTo(h - bw, -h + bw * 0.5);
      ctx.moveTo(-h + bw, h - bw * 0.5); ctx.lineTo(h - bw, h - bw * 0.5);
      ctx.stroke();
      // 内壁阴影（营造"凹进去"的深度）
      ctx.strokeStyle = 'rgba(60,40,20,.55)'; ctx.lineWidth = Math.max(1.5, size * 0.05);
      ctx.strokeRect(-h + bw, -h + bw, size - bw * 2, size - bw * 2);
      // 外描边
      ctx.strokeStyle = COL.woodDark; ctx.lineWidth = Math.max(1.5, size * 0.06);
      ctx.strokeRect(-h, -h, size, size);
      // 挂点夹子
      for (const [dx, dy] of [[-h * 0.58, -h * 0.58], [h * 0.58, h * 0.58]]) {
        ctx.fillStyle = '#2b2f36';
        ctx.beginPath(); ctx.arc(dx, dy, size * 0.075, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.arc(dx, dy, size * 0.04, 0, Math.PI * 2); ctx.fill();
      }
    } else if (def.pig) {
      drawPig(0, 0, size * 0.34, 0, false);
    } else if (def.wheel) {"""
assert old in t
t = t.replace(old, new)

# 建造：先画所有框，再画 inner（保证猪在框内、且框的边框压住猪的边）
old2 = """  function drawBuildCar() {
    const o = buildOrigin();
    const keys = Object.keys(state.build.cells);
    keys.forEach(k => {
      const cell = state.build.cells[k];
      const r = +k.split(',')[0], c = +k.split(',')[1];
      drawPartShape(cell.part, o.x + c * BUILD_PX + BUILD_PX / 2, o.y + r * BUILD_PX + BUILD_PX / 2, BUILD_PX * 0.84, cell.dir);
    });
    // 有木框就把猪画在车体中央（和参考一样：猪是车的一部分）
    const frames = keys.filter(k => RAP.PARTS[state.build.cells[k].part].structure);
    if (frames.length) {
      let sx = 0, sy = 0;
      frames.forEach(k => {
        sx += +k.split(',')[1]; sy += +k.split(',')[0];
      });
      const cx = o.x + (sx / frames.length) * BUILD_PX + BUILD_PX / 2;
      const cy = o.y + (sy / frames.length) * BUILD_PX + BUILD_PX / 2;
      drawPig(cx, cy, BUILD_PX * 0.34, 0);
    }
  }"""
new2 = """  function drawBuildCar() {
    const o = buildOrigin();
    const keys = Object.keys(state.build.cells);
    const at = (k) => ({
      x: o.x + (+k.split(',')[1]) * BUILD_PX + BUILD_PX / 2,
      y: o.y + (+k.split(',')[0]) * BUILD_PX + BUILD_PX / 2
    });
    // 先画所有零件（框是空的，能看到后面）
    keys.forEach(k => {
      const cell = state.build.cells[k];
      const p = at(k);
      drawPartShape(cell.part, p.x, p.y, BUILD_PX * 0.88, cell.dir);
    });
    // 再画框里的内嵌件（小猪），放在框的内壁之上
    keys.forEach(k => {
      const cell = state.build.cells[k];
      if (!cell.inner) return;
      const p = at(k);
      drawPartShape(cell.inner, p.x, p.y, BUILD_PX * 0.62, 0);
    });
  }"""
assert old2 in t
t = t.replace(old2, new2)

# 行驶：inner 件缩小画（车体 parts 已包含 inner）
t = t.replace("""    car.parts.forEach(p => {
      const wx = car.x + p.lx * ca - p.ly * sa;
      const wy = car.y + p.lx * sa + p.ly * ca;
      const s = worldToScreen(wx, wy, cam);
      drawPartShape(p.part, s.x, s.y, PPM * cam.zoom * 0.86, p.dir + (car.a * 180 / Math.PI) / 90);
    });""",
"""    // 先画非 inner 件，再画 inner（框里的猪要在框内壁之上）
    const ordered = car.parts.slice().sort((a, b) => (a.inner ? 1 : 0) - (b.inner ? 1 : 0));
    ordered.forEach(p => {
      const wx = car.x + p.lx * ca - p.ly * sa;
      const wy = car.y + p.lx * sa + p.ly * ca;
      const s = worldToScreen(wx, wy, cam);
      const size = PPM * cam.zoom * (p.inner ? 0.6 : 0.86);
      drawPartShape(p.part, s.x, s.y, size, p.dir + (car.a * 180 / Math.PI) / 90);
    });""")

# 不再额外画"车顶上的猪"（现在猪是零件，坐在框里）
old3 = """    // 猪：坐在车体里（跟着车体旋转）
    const pigLocalY = 0.15;
    const pp = worldToScreen(
      car.x + 0 * ca - pigLocalY * sa,
      car.y + 0 * sa + pigLocalY * ca, cam);
    drawPig(pp.x, pp.y, PPM * cam.zoom * 0.36, -car.a, state.run.pigHP < 3);"""
new3 = """    // 车体里没有猪的话（零件箱没放），提示一下
    if (!car.hasPig) {
      const tip = worldToScreen(car.x, car.y + 1.4, cam);
      text('车是空的：把小猪拖进木框里', tip.x, tip.y, 13, '#ffb4a2', 'center');
    }"""
assert old3 in t
t = t.replace(old3, new3)

# 受伤表情：把 hp 传给 inner 猪
t = t.replace("    } else if (def.pig) {\n      drawPig(0, 0, size * 0.34, 0, false);",
              "    } else if (def.pig) {\n      drawPig(0, 0, size * 0.34, 0, !!(def.__hurt));")

# 木箱图标用官方 105221 的话在 HTML 里没有图，保持图元
p.write_text(t, encoding="utf-8")
print("index.html: 中空木框 + 内嵌小猪渲染")

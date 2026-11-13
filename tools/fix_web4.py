"""视觉第三遍：向参考视频靠拢
1) 木框画成"木板"（横向木纹 + 深色描边），不再是三个孤立方块
2) 轮子 = 实心深色 + 亮色轮毂 + 胎圈高光（参考里轮子是实心的）
3) 猪有耳朵、眼睛、鼻子，坐在车体中央（建造界面也能看到猪）
4) 岩体加"石块"纹理（按位置确定性散布的暗色圆角块，裁在地形内）
5) HUD 改成参考的布局：左上红色暂停 + 绿色重开圆钮，计时右上，文字挪到按钮下面
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# ---------- 1) 零件绘制：木板 / 实心轮 / 猪 ----------
start = t.find("  function drawPartShape(")
end = t.find("  function drawBuildCar() {")
assert start > 0 and end > start
new_parts = '''  function drawPig(cx, cy, r, angle) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle || 0);
    // 耳朵
    ctx.fillStyle = '#5fae4c';
    ctx.beginPath(); ctx.arc(-r * 0.55, -r * 0.85, r * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.55, -r * 0.85, r * 0.28, 0, Math.PI * 2); ctx.fill();
    // 头
    ctx.fillStyle = COL.pig;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    // 眼睛
    ctx.fillStyle = '#1d2b1a';
    ctx.beginPath(); ctx.arc(-r * 0.34, -r * 0.18, r * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.34, -r * 0.18, r * 0.13, 0, Math.PI * 2); ctx.fill();
    // 鼻子
    ctx.fillStyle = '#8fd07a';
    ctx.beginPath(); ctx.ellipse(0, r * 0.26, r * 0.34, r * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4d7a44';
    ctx.beginPath(); ctx.arc(-r * 0.12, r * 0.26, r * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.12, r * 0.26, r * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPartShape(part, cx, cy, size, dir) {
    const def = RAP.PARTS[part];
    const h = size / 2;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate((dir || 0) * Math.PI / 2);
    if (def.structure) {
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
    } else if (def.wheel) {
      // 实心轮 + 轮毂
      ctx.fillStyle = '#20262c';
      ctx.beginPath(); ctx.arc(0, 0, h, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(0, 0, h * 0.86, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = def.rim || COL.ironRim;
      ctx.beginPath(); ctx.arc(0, 0, h * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.beginPath(); ctx.arc(0, 0, h * 0.62, -2.4, -0.6); ctx.stroke();
    } else if (def.energy) {
      ctx.fillStyle = def.color; roundRect(-h * 0.55, -h * 0.75, size * 0.55, size * 0.75, 3); ctx.fill();
      ctx.strokeStyle = '#4d7a2e'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff8c8';
      ctx.beginPath();
      ctx.moveTo(-h * 0.1, -h * 0.55); ctx.lineTo(h * 0.18, -h * 0.12);
      ctx.lineTo(-h * 0.02, -h * 0.12); ctx.lineTo(h * 0.1, h * 0.32);
      ctx.lineTo(-h * 0.22, -h * 0.02); ctx.lineTo(-h * 0.02, -h * 0.02);
      ctx.closePath(); ctx.fill();
    } else if (def.motor) {
      ctx.fillStyle = def.color; roundRect(-h * 0.72, -h * 0.5, size * 0.72, size * 0.5, 3); ctx.fill();
      ctx.strokeStyle = '#8d3b28'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#3b2b26'; ctx.fillRect(h * 0.02, -h * 0.18, size * 0.18, size * 0.18);
      ctx.fillStyle = '#f0d0b0'; ctx.fillRect(-h * 0.62, -h * 0.4, size * 0.3, size * 0.1);
    } else if (def.interactive) {
      // 打气筒：筒 + 活塞
      ctx.fillStyle = '#2f5e78'; roundRect(-h * 0.3, -h * 0.62, size * 0.3, size * 0.62, 3); ctx.fill();
      ctx.fillStyle = def.color; roundRect(-h * 0.38, -h * 0.72, size * 0.38, size * 0.2, 3); ctx.fill();
      ctx.fillStyle = '#e8f4ff'; ctx.fillRect(-h * 0.66, -h * 0.2, size * 0.34, size * 0.09);
    } else {
      ctx.fillStyle = def.color; roundRect(-h * 0.8, -h * 0.8, size * 0.8, size * 0.8, 3); ctx.fill();
    }
    ctx.restore();
  }

'''
t = t[:start] + new_parts + t[end:]

# ---------- 2) 建造界面也画猪 ----------
t = t.replace("""  function drawBuildCar() {
    const o = buildOrigin();
    Object.keys(state.build.cells).forEach(k => {
      const cell = state.build.cells[k];
      const r = +k.split(',')[0], c = +k.split(',')[1];
      drawPartShape(cell.part, o.x + c * PPM + PPM / 2, o.y + r * PPM + PPM / 2, PPM * 0.8, cell.dir)
    });
  }""",
"""  function drawBuildCar() {
    const o = buildOrigin();
    const keys = Object.keys(state.build.cells);
    keys.forEach(k => {
      const cell = state.build.cells[k];
      const r = +k.split(',')[0], c = +k.split(',')[1];
      drawPartShape(cell.part, o.x + c * PPM + PPM / 2, o.y + r * PPM + PPM / 2, PPM * 0.8, cell.dir);
    });
    // 有木框就把猪画在车体中央（和参考一样：猪是车的一部分）
    const frames = keys.filter(k => RAP.PARTS[state.build.cells[k].part].structure);
    if (frames.length) {
      let sx = 0, sy = 0;
      frames.forEach(k => {
        sx += +k.split(',')[1]; sy += +k.split(',')[0];
      });
      const cx = o.x + (sx / frames.length) * PPM + PPM / 2;
      const cy = o.y + (sy / frames.length) * PPM + PPM / 2;
      drawPig(cx, cy, PPM * 0.34, 0);
    }
  }""")

# ---------- 3) 岩体石块纹理 ----------
t = t.replace("""    // 地表材质带（沿同一条折线画粗线）""",
"""    // 石块纹理：确定性散布，裁在地形里
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(toX(pts[0][0]), toY(pts[0][1]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(toX(pts[i][0]), toY(pts[i][1]));
    ctx.lineTo(toX(pts[pts.length - 1][0]), DH + 40);
    ctx.lineTo(toX(pts[0][0]), DH + 40);
    ctx.closePath();
    ctx.clip();
    const cw = 44 * cam.zoom, ch = 26 * cam.zoom;
    const y0 = toY(cam.y) - 40;
    for (let row = 0; row < 24; row++) {
      for (let col = 0; col < 40; col++) {
        const bx = ((col * cw + (row % 2) * cw * 0.5) % (DW + cw)) - cw * 0.5;
        const by = y0 + row * ch;
        const n = ((row * 31 + col * 17) % 7);
        ctx.fillStyle = n < 3 ? 'rgba(255,255,255,.06)' : (n < 5 ? 'rgba(0,0,0,.07)' : 'rgba(0,0,0,.03)');
        roundRect(bx, by, cw * 0.82, ch * 0.7, 6 * cam.zoom);
        ctx.fill();
      }
    }
    ctx.restore();

    // 地表材质带（沿同一条折线画粗线）""")

# ---------- 4) HUD：左上圆钮 + 文字下移；木箱计数挪到 HUD 条里 ----------
old_hud = t[t.find("  function drawHud() {"):t.find("  function drawRun(elapsed) {")]
assert old_hud
new_hud = '''  function drawHud() {
    const built = RAP.buildVehicle(level(), state.build);
    const mass = built ? built.mass : 0;
    const energy = built ? built.energyMax : 0;
    let line = `总重 ${mass.toFixed(1)} kg　能量 ${Math.round(energy)}　交互键 ${built ? built.interactives.length : 0}/${RAP.Params.interactCap}`;
    let boxLine = '';
    if (state.phase === 'run' && state.run) {
      const car = state.run.car;
      line = `总重 ${car.mass.toFixed(1)} kg　能量 ${Math.round(car.energy)}　速度 ${Math.hypot(car.vx, car.vy).toFixed(1)} m/s`;
      boxLine = `木箱 ${state.run.boxesGot}/${state.run.boxes.length}`;
    }

    // 左上：暂停 / 重开（和参考一致的位置）
    ctx.fillStyle = '#e0513c';
    ctx.beginPath(); ctx.arc(48, 108, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(41, 97, 5, 22); ctx.fillRect(50, 97, 5, 22);
    ctx.fillStyle = '#63bf3f';
    ctx.beginPath(); ctx.arc(48, 160, 22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(48, 160, 12, -0.6, 3.6); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(60, 152); ctx.lineTo(61, 162); ctx.lineTo(51, 160); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill();

    // 顶部信息条
    ctx.fillStyle = 'rgba(16,22,28,.72)'; roundRect(84, 92, 520, 28, 6); ctx.fill();
    text(line, 96, 112, 14, '#dfe9f2');

    if (state.phase === 'run' && state.run) {
      ctx.fillStyle = 'rgba(16,22,28,.72)'; roundRect(DW - 210, 92, 186, 28, 6); ctx.fill();
      text(state.run.time.toFixed(2) + ' s', DW - 44, 112, 16, '#ffd93d', 'right');
      if (boxLine) {
        ctx.fillStyle = 'rgba(16,22,28,.72)'; roundRect(DW - 210, 128, 186, 24, 6); ctx.fill();
        text(boxLine, DW - 44, 145, 13, '#cfe0ef', 'right');
      }
    }
  }

'''
t = t.replace(old_hud, new_hud)

p.write_text(t, encoding="utf-8")
print("index.html: 视觉第三遍完成")

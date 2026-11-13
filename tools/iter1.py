"""迭代：向参考视频再靠一档
A) 相机拉近（车占屏宽 9% → ~17%）
B) 前景加沙滩 + 海水 + 浪花（参考里最显眼的一层）
C) 远景丛林加棕榈剪影
D) 行驶时交互键挪到底部中间（浅绿）——和参考一致
E) 结算卡片从顶部滑入 + 三枚圆形徽章（猪/星/秒表）+ 金币
F) 木框加"挂点夹子"（小螺丝）
G) WebAudio 合成音效（放置/发射/吃箱/胜利/失败）+ 猪受伤表情
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# ---------------- A) 相机 ----------------
t = t.replace("    return { x: level().start.col + 3.5, y: sy + 1.8, zoom: 1.5 };",
              "    return { x: level().start.col + 3.2, y: sy + 1.55, zoom: 2.1 };")
t = t.replace("cam: { x: 0, y: 0, zoom: 1.5 }, toast: '', toastT: 0,",
              "cam: { x: 0, y: 0, zoom: 2.1 }, toast: '', toastT: 0, resultT: 0,")
t = t.replace("const cam = { x: car.x + 2.5, y: Math.max(car.y, st.terrain.surfaceY(car.x)) + 1.4, zoom: 1.15 };",
              "const cam = { x: car.x + 2.0, y: Math.max(car.y, st.terrain.surfaceY(car.x)) + 1.5, zoom: 1.7 };")

# ---------------- C) 棕榈剪影 + B) 海面（插在 drawWorld 里） ----------------
old_jungle = """    ctx.fillStyle = 'rgba(30,80,40,.28)';
    ctx.fillRect(0, Math.max(0, horizonY + 10), DW, DH);"""
new_jungle = """    // 棕榈剪影（参考视频里最显眼的一层）
    function palm(px, py, scale, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#2f6b35'; ctx.lineWidth = 5 * scale; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + 6 * scale, py - 46 * scale, px + 2 * scale, py - 84 * scale);
      ctx.stroke();
      ctx.strokeStyle = '#357a3a'; ctx.lineWidth = 7 * scale;
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k - 2.5) * 0.5;
        ctx.beginPath();
        ctx.moveTo(px + 2 * scale, py - 84 * scale);
        ctx.quadraticCurveTo(
          px + Math.cos(a) * 34 * scale, py - 84 * scale + Math.sin(a) * 20 * scale - 12 * scale,
          px + Math.cos(a) * 54 * scale, py - 84 * scale + Math.sin(a) * 34 * scale + 6 * scale);
        ctx.stroke();
      }
      ctx.restore();
    }
    const palmBase = horizonY + 26;
    palm(DW * 0.08, palmBase, 1.0, 0.5);
    palm(DW * 0.21, palmBase + 8, 0.8, 0.42);
    palm(DW * 0.74, palmBase + 4, 0.95, 0.48);
    palm(DW * 0.88, palmBase + 12, 0.75, 0.4);

    ctx.fillStyle = 'rgba(30,80,40,.28)';
    ctx.fillRect(0, Math.max(0, horizonY + 10), DW, DH);"""
assert old_jungle in t
t = t.replace(old_jungle, new_jungle)

# 海面：在 drawWorld 末尾（地形之后）画前景海
old_tail = """    // 冰面：把冰列的地表再描一遍青色
    ctx.save();
    for (let i = 0; i < pts.length; i++) {
      if (ter.material[Math.max(0, Math.min(ter.cols - 1, Math.floor(pts[i][0])))] !== 'ice') continue;
      const x0 = toX(pts[i][0]);
      ctx.fillStyle = 'rgba(190,240,250,.85)';
      ctx.fillRect(x0 - stepW * s / 2, toY(pts[i][1]) + 1, stepW * s + 1, 6 * cam.zoom);
    }
    ctx.restore();
  }"""
new_tail = """    // 冰面：把冰列的地表再描一遍青色
    ctx.save();
    for (let i = 0; i < pts.length; i++) {
      if (ter.material[Math.max(0, Math.min(ter.cols - 1, Math.floor(pts[i][0])))] !== 'ice') continue;
      const x0 = toX(pts[i][0]);
      ctx.fillStyle = 'rgba(190,240,250,.85)';
      ctx.fillRect(x0 - stepW * s / 2, toY(pts[i][1]) + 1, stepW * s + 1, 6 * cam.zoom);
    }
    ctx.restore();

    // 前景：沙滩 + 海水 + 浪花（参考视频底部那一层）
    const seaY = DH * 0.87;
    ctx.fillStyle = '#e0d49a';
    ctx.fillRect(0, seaY - 16, DW, 16);
    const sea = ctx.createLinearGradient(0, seaY, 0, DH);
    sea.addColorStop(0, '#3fb6d2');
    sea.addColorStop(0.5, '#2fa3c4');
    sea.addColorStop(1, '#2288ad');
    ctx.fillStyle = sea;
    ctx.fillRect(0, seaY, DW, DH - seaY);
    // 浪花：白色波浪线 + 泡沫点
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 5;
    ctx.beginPath();
    for (let x = 0; x <= DW; x += 12) {
      const y = seaY + Math.sin(x / 42) * 4;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 26; i++) {
      const x = (i * 137) % DW, y = seaY + 10 + ((i * 53) % 22);
      ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2); ctx.fill();
    }
  }"""
assert old_tail in t
t = t.replace(old_tail, new_tail)

# ---------------- F) 木框挂点夹子 ----------------
t = t.replace("""      ctx.fillStyle = 'rgba(255,235,200,.18)';
      ctx.fillRect(-h + size * 0.1, -h + size * 0.1, size * 0.8, size * 0.12);""",
"""      ctx.fillStyle = 'rgba(255,235,200,.18)';
      ctx.fillRect(-h + size * 0.1, -h + size * 0.1, size * 0.8, size * 0.12);
      // 挂点夹子（参考里木框上的红黑小夹子）
      for (const dx of [-h * 0.62, h * 0.62]) {
        ctx.fillStyle = '#2b2f36';
        roundRect(dx - size * 0.09, -h * 0.16, size * 0.18, size * 0.32, 2); ctx.fill();
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.arc(dx, -h * 0.16, size * 0.07, 0, Math.PI * 2); ctx.fill();
      }""")

# ---------------- D) 交互键挪到底部中间 ----------------
t = t.replace("      if (name === 'interact') return { x: DW - 300, y: DH - 120, w: 84, h: 84 };",
              "      if (name === 'interact') return { x: 0, y: DH - 148, w: 84, h: 84 };")
# 绘制与命中共用一个"底部中间"计算
t = t.replace("""      const list = state.run.car.interactives || [];
      for (let i = 0; i < Math.min(3, list.length); i++) {
        const rect = { x: btnRect('interact').x + i * 96, y: btnRect('interact').y, w: 84, h: 84 };""",
"""      const list = state.run.car.interactives || [];
      const n = Math.min(3, list.length);
      const x0 = DW / 2 - (n * 96) / 2;
      for (let i = 0; i < n; i++) {
        const rect = { x: x0 + i * 96, y: btnRect('interact').y, w: 84, h: 84 };""")
t = t.replace("""      const r = state.run.car.interactives || [];
      for (let i = 0; i < Math.min(3, r.length); i++) {
        const rect = { x: btnRect('interact').x + i * 96, y: btnRect('interact').y, w: 84, h: 84 };
        if (hit(rect, p.x, p.y)) { RAP.pressInteract(state.run, i + 1); return; }
      }""",
"""      const r = state.run.car.interactives || [];
      const nm = Math.min(3, r.length);
      const xs = DW / 2 - (nm * 96) / 2;
      for (let i = 0; i < nm; i++) {
        const rect = { x: xs + i * 96, y: btnRect('interact').y, w: 84, h: 84 };
        if (hit(rect, p.x, p.y)) { RAP.pressInteract(state.run, i + 1); return; }
      }""")
t = t.replace("""      const r = state.run.car.interactives || [];
      for (let i = 0; i < Math.min(3, r.length); i++) {
        const rect = { x: btnRect('interact').x + i * 96, y: btnRect('interact').y, w: 84, h: 84 };
        if (hit(rect, p.x, p.y)) { RAP.releaseInteract(state.run, i + 1); return; }
      }""",
"""      const r = state.run.car.interactives || [];
      const nm2 = Math.min(3, r.length);
      const xs2 = DW / 2 - (nm2 * 96) / 2;
      for (let i = 0; i < nm2; i++) {
        const rect = { x: xs2 + i * 96, y: btnRect('interact').y, w: 84, h: 84 };
        if (hit(rect, p.x, p.y)) { RAP.releaseInteract(state.run, i + 1); return; }
      }""")

p.write_text(t, encoding="utf-8")
print("迭代 A/B/C/D/F 完成")

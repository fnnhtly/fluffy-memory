"""界面层第二批：分段损坏外观、箭头配色、掉落物、零件名、上手提示。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) drawPartShape 增加 hp 参数 + 分段损坏 ----------
rep("  function drawPartShape(part, cx, cy, size, dir) {",
    "  function drawPartShape(part, cx, cy, size, dir, hp) {", "hp 参数")

rep("""      // 挂点夹子
      for (const [dx, dy] of [[-h * 0.58, -h * 0.58], [h * 0.58, h * 0.58]]) {
        ctx.fillStyle = '#2b2f36';
        ctx.beginPath(); ctx.arc(dx, dy, size * 0.075, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.arc(dx, dy, size * 0.04, 0, Math.PI * 2); ctx.fill();
      }""",
"""      // 挂点夹子
      for (const [dx, dy] of [[-h * 0.58, -h * 0.58], [h * 0.58, h * 0.58]]) {
        ctx.fillStyle = '#2b2f36';
        ctx.beginPath(); ctx.arc(dx, dy, size * 0.075, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.arc(dx, dy, size * 0.04, 0, Math.PI * 2); ctx.fill();
      }
      // 阶段损坏：hp 2 = 裂纹，hp 1 = 破损（缺一条边 + 发黑）
      const stage = (hp === undefined || hp === null) ? 3 : hp;
      if (stage <= 2) {
        ctx.strokeStyle = 'rgba(30,20,12,.75)'; ctx.lineWidth = Math.max(1.2, size * 0.035);
        ctx.beginPath();
        ctx.moveTo(-h + bw * 0.4, -h + bw * 0.4);
        ctx.lineTo(-h * 0.1, h * 0.1);
        ctx.lineTo(h * 0.25, -h * 0.15);
        ctx.stroke();
      }
      if (stage <= 1) {
        ctx.fillStyle = 'rgba(30,20,12,.35)';
        ctx.fillRect(-h, -h, size, size);
        // 缺掉右边一条
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.clearRect(h - bw, -h, bw, size);   // 用透明"啃掉"一边（在画布上等于缺口）
      }""", "分段损坏")

# 建造：地板上的框传 maxHp（完好）
rep("      drawPartShape(cell.part, p.x, p.y, BUILD_PX * 0.88, cell.dir);",
    "      drawPartShape(cell.part, p.x, p.y, BUILD_PX * 0.88, cell.dir, cell.part === 'wood_frame' ? 3 : undefined);",
    "建造时完好")

# 行驶：传实际 hp
rep("      drawPartShape(p.part, s.x, s.y, size, p.dir + (car.a * 180 / Math.PI) / 90);",
    "      drawPartShape(p.part, s.x, s.y, size, p.dir + (car.a * 180 / Math.PI) / 90, p.hp);",
    "行驶传 hp")

# ---------- 2) 箭头：零件本色 + 白描边 + 方向字 ----------
rep("""  function drawDirArrow(cx, cy, dir, size, color, glow) {
    const v = RAP.dirVec(dir);
    const len = size * 0.52;
    const x2 = cx + v[0] * len, y2 = cy - v[1] * len;
    ctx.save();
    ctx.lineCap = 'round';
    if (glow) {
      ctx.strokeStyle = 'rgba(232,200,122,.35)'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.strokeStyle = color || '#E8C87A'; ctx.lineWidth = glow ? 4 : 3;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x2, y2); ctx.stroke();""",
"""  function drawDirArrow(cx, cy, dir, size, color, glow) {
    const v = RAP.dirVec(dir);
    const len = size * 0.62;
    const x2 = cx + v[0] * len, y2 = cy - v[1] * len;
    ctx.save();
    ctx.lineCap = 'round';
    // 白色包边，保证在任何背景上都看得清
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = glow ? 9 : 7;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x2, y2); ctx.stroke();
    if (glow) {
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 16;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.strokeStyle = color || '#E8C87A'; ctx.lineWidth = glow ? 6 : 4;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x2, y2); ctx.stroke();""", "箭头白边")

# 建造箭头：用零件本色；悬停时写方向字
rep("""      drawDirArrow(p.x, p.y, cell.dir || 0, BUILD_PX, isHover ? '#FFF3C4' : '#E8C87A', isHover);""",
"""      drawDirArrow(p.x, p.y, cell.dir || 0, BUILD_PX, RAP.PARTS[cell.part].color, isHover);
      if (isHover) {
        const vv = RAP.dirVec(cell.dir || 0);
        const wd = { '1,0': '右', '-1,0': '左', '0,1': '上', '0,-1': '下' }[vv[0] + ',' + vv[1]] || '';
        text(wd, p.x + vv[0] * BUILD_PX * 0.8, p.y - vv[1] * BUILD_PX * 0.8 + 5, 14, '#ffffff', 'center', true);
      }""", "箭头用零件色 + 方向字")

# 行驶箭头：同组用本色
rep("      drawDirArrow(s.x, s.y, (p.dir || 0) + Math.round((car.a * 180 / Math.PI) / 90), PPM * cam.zoom * 0.9, 'rgba(232,200,122,.7)', false);",
    "      drawDirArrow(s.x, s.y, (p.dir || 0) + Math.round((car.a * 180 / Math.PI) / 90), PPM * cam.zoom * 0.9, RAP.PARTS[p.part].color, false);",
    "行驶箭头本色")

# ---------- 3) 掉落物渲染 ----------
rep("""    // 终点旗""",
"""    // 掉出来的东西（框碎了之后真的会掉下来）
    (st.loose || []).forEach(L => {
      const sp = worldToScreen(L.x, L.y, cam);
      const rr = PPM * cam.zoom * L.r;
      ctx.save();
      ctx.globalAlpha = 0.22; ctx.fillStyle = '#16211a';
      const gy = worldToScreen(L.x, st.terrain.surfaceY(L.x), cam);
      ctx.beginPath(); ctx.ellipse(sp.x, gy.y, rr * 0.9, rr * 0.25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (RAP.PARTS[L.part] && RAP.PARTS[L.part].pig) drawPig(sp.x, sp.y, rr, -L.a, true);
      else drawPartShape(L.part, sp.x, sp.y, rr * 2, 0);
    });

    // 终点旗""", "掉落物渲染")

# ---------- 4) 零件槽显示名字 + 拖拽提示 ----------
rep("""  function drawTray() {
    TRAY.forEach((part, i) => {""",
"""  function drawTray() {
    let hoverIdx = -1;
    TRAY.forEach((part, i) => {
      if (hit(trayRect(i), state.mouse.x, state.mouse.y)) hoverIdx = i;
    });
    TRAY.forEach((part, i) => {""", "槽悬停检测")

rep("""      text(part === 'eraser' ? '' : String(left),
        rect.x + rect.w / 2, rect.y + rect.h + 16, 13,
        left > 0 || part === 'eraser' ? '#ffffff' : '#ff9c86', 'center');""",
"""      text(part === 'eraser' ? '' : String(left),
        rect.x + rect.w / 2, rect.y + rect.h + 14, 12,
        left > 0 || part === 'eraser' ? '#ffffff' : '#ff9c86', 'center');
      // 悬停 / 选中 → 在槽上方显示零件名（"选了什么"必须一眼看到）
      if (i === hoverIdx || state.selected === part) {
        const nm = part === 'eraser' ? '橡皮' : RAP.PARTS[part].label;
        const w = Math.max(72, nm.length * 15 + 26);
        ctx.fillStyle = 'rgba(10,18,24,.92)';
        roundRect(rect.x + rect.w / 2 - w / 2, rect.y - 34, w, 26, 8); ctx.fill();
        text(nm, rect.x + rect.w / 2, rect.y - 16, 14, '#ffe9b0', 'center', true);
      }""", "槽名提示")

# ---------- 5) 上手提示：没放猪时在槽上方闪 ----------
rep("""    if (state.phase === 'build') {
      const boxParts = Object.keys(level().partsBox || {})""",
"""    if (state.phase === 'build') {
      const hasPig = Object.keys(state.build.cells).some(k => state.build.cells[k].inner === 'pig');
      if (!hasPig) {
        const pigIdx = TRAY.indexOf('pig');
        if (pigIdx >= 0) {
          const r = trayRect(pigIdx);
          const a = 0.55 + 0.45 * Math.sin(performance.now() / 220);
          ctx.save(); ctx.globalAlpha = a;
          ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 3;
          roundRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 10); ctx.stroke();
          ctx.restore();
          text('把小猪拖进木框才能出发', r.x + r.w / 2, r.y - 44, 13, '#ffd93d', 'center', true);
        }
      }
      const boxParts = Object.keys(level().partsBox || {})""", "没放猪提示")

p.write_text(t, encoding="utf-8")
print("index.html 第二批完成")

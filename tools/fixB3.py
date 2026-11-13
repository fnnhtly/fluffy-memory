"""第二part：帮助面板 UI、暂停/重来按钮绘制与点击、暂停冻结物理、用说明面板替掉 3 步清单。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) 点击：帮助 / 暂停 / 重来 ----------
rep("      if (hit(bRot, p.x, p.y)) {",
"""      const bHelp = btnRect('help');
      if (hit(bHelp, p.x, p.y)) { state.helpOpen = !state.helpOpen; return; }
      if (hit(bRot, p.x, p.y)) {""", "帮助点击(build)")

rep("""    if (state.phase === 'run' && state.run) {
      const gs = state.run.car.groups || [];""",
"""    if (state.phase === 'run') {
      if (hit(btnRect('pause'), p.x, p.y)) { state.paused = !state.paused; return; }
      if (hit(btnRect('restartRun'), p.x, p.y)) {
        state.phase = 'build'; state.run = null; state.paused = false; return;
      }
      if (hit(btnRect('help'), p.x, p.y)) { state.helpOpen = !state.helpOpen; return; }
    }
    if (state.phase === 'run' && state.run) {
      const gs = state.run.car.groups || [];""", "暂停/重来/帮助点击(run)")

# ---------- 2) 暂停冻结物理 ----------
rep("""      if (state.run && state.run.phase === 'run') {
        // 固定 60Hz 累加""",
"""      if (state.run && state.run.phase === 'run' && !state.paused) {
        // 固定 60Hz 累加""", "暂停冻结")

# ---------- 3) 绘制：帮助面板 ----------
rep("  function drawToast() {",
"""  function drawHelp() {
    if (!state.helpOpen) return;
    const W = 900, H = 520, X = (DW - W) / 2, Y = 90;
    ctx.fillStyle = 'rgba(6,12,14,.78)'; ctx.fillRect(0, 0, DW, DH);
    ctx.fillStyle = '#132430'; roundRect(X, Y, W, H, 16); ctx.fill();
    ctx.strokeStyle = 'rgba(232,200,122,.55)'; ctx.lineWidth = 2; ctx.stroke();
    text('零件说明（知道每个东西干什么，才能搭得出来）', X + 24, Y + 38, 18, '#ffe9b0', 'left', true);

    const order = RAP.TRAY_ORDER;
    order.forEach((part, i) => {
      const def = RAP.PARTS[part];
      const yy = Y + 78 + i * 56;
      drawPartShape(part, X + 56, yy + 8, 34, 0);
      text(def.label, X + 88, yy + 2, 15, '#e6f0f8', 'left', true);
      // 质量 / 类别
      const tags = [];
      tags.push(def.mass + ' kg');
      if (def.structure) tags.push('结构');
      if (def.wheel) tags.push('轮子');
      if (def.motor) tags.push('动力');
      if (def.energy) tags.push('能量 +' + def.energy);
      if (def.interactive) tags.push('交互件');
      if (def.inner) tags.push('只能放框里');
      if (def.dir) tags.push('有方向');
      text(tags.join(' · '), X + 88, yy + 20, 11, '#8fb6c9', 'left');
      // 说明（自动换行）
      const words = (def.desc || '');
      let line = '', lx = X + 220, ly = yy + 2;
      for (const ch of words) {
        if (ctx.measureText(line + ch).width > W - 260) {
          text(line, lx, ly, 13, '#cfe0ee', 'left'); line = ''; ly += 18;
        }
        line += ch;
      }
      if (line) text(line, lx, ly, 13, '#cfe0ee', 'left');
    });
    text('按 H 或点右上角 ? 关闭', X + W - 24, Y + H - 18, 12, '#7f97a6', 'right');
  }

  function drawToast() {""", "帮助面板绘制")

# ---------- 4) 绘制：暂停/重来/帮助按钮（run） ----------
rep("""      // 左上：暂停 / 重开（和参考一致的位置）
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
      ctx.fillStyle = '#fff'; ctx.fill();""",
"""      // 左上：暂停 / 重来（可点击）
      const PB = btnRect('pause'), RB = btnRect('restartRun');
      const pc = { x: PB.x + PB.w / 2, y: PB.y + PB.h / 2 };
      ctx.fillStyle = state.paused ? '#63bf3f' : '#e0513c';
      ctx.beginPath(); ctx.arc(pc.x, pc.y, PB.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff';
      if (state.paused) {          // 暂停时显示"播放三角"
        ctx.beginPath();
        ctx.moveTo(pc.x - 6, pc.y - 10); ctx.lineTo(pc.x + 10, pc.y);
        ctx.lineTo(pc.x - 6, pc.y + 10); ctx.closePath(); ctx.fill();
      } else {
        ctx.fillRect(pc.x - 7, pc.y - 10, 5, 20);
        ctx.fillRect(pc.x + 2, pc.y - 10, 5, 20);
      }
      const rc = { x: RB.x + RB.w / 2, y: RB.y + RB.h / 2 };
      ctx.fillStyle = '#63bf3f';
      ctx.beginPath(); ctx.arc(rc.x, rc.y, RB.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(rc.x, rc.y, 10, -0.6, 3.6); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rc.x + 10, rc.y - 8); ctx.lineTo(rc.x + 11, rc.y + 2);
      ctx.lineTo(rc.x + 1, rc.y); ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.fill();
      // 右上：帮助
      if (state.run) {
        const HB = btnRect('help');
        const hcx = HB.x + HB.w / 2, hcy = HB.y + HB.h / 2;
        ctx.fillStyle = 'rgba(24,34,42,.85)';
        ctx.beginPath(); ctx.arc(hcx, hcy, HB.w / 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(232,200,122,.7)'; ctx.lineWidth = 2; ctx.stroke();
        text('?', hcx, hcy + 7, 22, '#ffe9b0', 'center', true);
      }
      // 暂停遮罩
      if (state.paused) {
        ctx.fillStyle = 'rgba(6,12,14,.45)'; ctx.fillRect(0, 0, DW, DH);
        text('已暂停', DW / 2, DH / 2 - 10, 40, '#e8f2fa', 'center', true);
        text('点左上红钮继续／绿钮回建造', DW / 2, DH / 2 + 34, 16, '#a8bfd0', 'center');
      }""", "暂停/重来/帮助绘制")

# ---------- 5) 帮助按钮（build）绘制 ----------
rep("      }, '换方向 R', canRot);",
"""      }, '换方向 R', canRot);
      // 帮助按钮（建造界面）
      const HB2 = btnRect('help');
      ctx.fillStyle = state.helpOpen ? 'rgba(74,123,168,.95)' : 'rgba(24,34,42,.85)';
      roundRect(HB2.x, HB2.y, HB2.w, HB2.h, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(232,200,122,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      text('? 零件说明', HB2.x + HB2.w / 2, HB2.y + 28, 13, '#ffe9b0', 'center', true);""", "帮助按钮(build)绘制")

# ---------- 6) 用说明替换 3 步清单 ----------
start = t.find("      // ---- 3 步新手引导 ----")
end = t.find('      // 重心偏移：让玩家知道"车头偏重 / 整体太高"')
assert start > 0 and end > start
t = t[:start] + t[end:]
print("  ok: 移除 3 步清单")

# 选中零件时在底部显示一行说明
rep("""      const boxParts = Object.keys(level().partsBox || {})""",
"""      // 当前选中零件的说明（一行）
      if (RAP.PARTS[state.selected] && RAP.PARTS[state.selected].desc) {
        const nm = RAP.PARTS[state.selected].label;
        ctx.fillStyle = 'rgba(12,20,26,.8)';
        roundRect(84, DH - 108, 620, 26, 8); ctx.fill();
        text(nm + '：' + RAP.PARTS[state.selected].desc, 96, DH - 90, 12, '#cfe0ee', 'left');
      }
      const boxParts = Object.keys(level().partsBox || {})""", "选中零件说明行")

# ---------- 7) 每帧画帮助面板 + H 键 ----------
rep("    drawToast();\n  }", "    drawHelp();\n    drawToast();\n  }", "画帮助面板")
rep("    if (k === 't') {", "    if (k === 'h') { state.helpOpen = !state.helpOpen; return; }\n    if (k === 't') {", "H 键")

p.write_text(t, encoding="utf-8")
print("part2 written")

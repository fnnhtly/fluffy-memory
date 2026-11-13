"""A 方案第一件：3 步新手引导（勾选清单 + 该做的零件槽闪烁）
第二件：按钮重排（左侧竖排三键 / 右侧出发，标签不再互相压）
第三件：箭头在密格里更清楚（从格子边缘往外画、网格变淡）
另修：槽位提示与"没放猪"提示撞在一起
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------------- 1) 按钮布局 ----------------
rep("      if (name === 'launch') return { x: DW / 2 + 140, y: 286, w: 64, h: 64 };",
    "      if (name === 'launch') return { x: DW / 2 + 150, y: 288, w: 76, h: 76 };", "出发右下")
rep("      if (name === 'clear') return { x: DW / 2 - 204, y: 270, w: 64, h: 64 };",
    "      if (name === 'clear') return { x: 84, y: 292, w: 56, h: 56 };", "清空左列1")
rep("      if (name === 'undo') return { x: DW / 2 - 240, y: 356, w: 56, h: 56 };",
    "      if (name === 'undo') return { x: 84, y: 366, w: 56, h: 56 };", "撤销左列2")
rep("      if (name === 'rotate') return { x: DW / 2 + 140, y: 366, w: 96, h: 40 };",
    "      if (name === 'rotate') return { x: 84, y: 440, w: 56, h: 56 };", "换方向左列3")

# 绘制部分：把三个按钮画成统一的小圆钮 + 下方文字
old_btns = t[t.find("      const car = RAP.buildVehicle(level(), state.build);\n      const canGo = !!car;"):t.find("    if (state.phase === 'run' && state.run) {")]
assert old_btns
new_btns = '''      const car = RAP.buildVehicle(level(), state.build);
      const chk = RAP.canLaunch(state.build);
      const LC = { x: L.x + L.w / 2, y: L.y + L.h / 2 };
      // 出发：大圆对勾（未就绪时变灰 + 呼吸提示）
      const ready = chk.ok;
      ctx.fillStyle = ready ? '#4a9be0' : 'rgba(90,104,116,.85)';
      ctx.beginPath(); ctx.arc(LC.x, LC.y, L.w / 2, 0, Math.PI * 2); ctx.fill();
      if (ready) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
        ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.35 * pulse})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(LC.x, LC.y, L.w / 2 + 6 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(LC.x - 14, LC.y + 1); ctx.lineTo(LC.x - 4, LC.y + 11); ctx.lineTo(LC.x + 15, LC.y - 11);
      ctx.stroke();
      text('出发', LC.x, L.y + L.h + 20, 14, ready ? '#dff0ff' : '#93a3ae', 'center', true);

      // 左列三个小圆钮
      function knob(rect, icon, label, active) {
        const c = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
        ctx.fillStyle = active ? 'rgba(74,123,168,.95)' : 'rgba(24,34,42,.82)';
        ctx.beginPath(); ctx.arc(c.x, c.y, rect.w / 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = active ? 'rgba(255,255,255,.5)' : 'rgba(150,170,185,.35)';
        ctx.lineWidth = 2; ctx.stroke();
        icon(c, rect.w);
        text(label, c.x, rect.y + rect.h + 16, 11, active ? '#cfe4f5' : '#8fa3b3', 'center');
      }
      knob(C, (c, w) => {            // 清空：垃圾桶
        ctx.fillStyle = '#dce6ee';
        ctx.fillRect(c.x - 8, c.y - 9, 16, 4);
        ctx.fillRect(c.x - 5, c.y - 12, 10, 4);
        ctx.fillRect(c.x - 7, c.y - 4, 14, 15);
      }, '清空', false);
      knob(U, (c, w) => {            // 撤销：回转箭头
        ctx.strokeStyle = '#dce6ee'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(c.x, c.y, 9, -0.4, 3.9); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(c.x + 9, c.y - 7); ctx.lineTo(c.x + 3, c.y - 12); ctx.lineTo(c.x + 2, c.y - 3);
        ctx.closePath(); ctx.fillStyle = '#dce6ee'; ctx.fill();
      }, '撤销 Z', false);
      const Rr = btnRect('rotate');
      const hc = cellAt(state.mouse.x, state.mouse.y);
      const canRot = !!(hc && state.build.cells[hc.r + ',' + hc.c] &&
        RAP.isDirectional(state.build.cells[hc.r + ',' + hc.c].part));
      knob(Rr, (c, w) => {           // 换方向：环形箭头 + 方向字
        ctx.strokeStyle = canRot ? '#ffe9b0' : '#dce6ee'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0.6, 5.2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(c.x + 8, c.y - 6); ctx.lineTo(c.x + 12, c.y + 1); ctx.lineTo(c.x + 4, c.y + 1);
        ctx.closePath(); ctx.fillStyle = canRot ? '#ffe9b0' : '#dce6ee'; ctx.fill();
      }, '换方向 R', canRot);
'''
t = t.replace(old_btns, new_btns)
print("  ok: 按钮重排")

# ---------------- 2) 网格淡一点，箭头更醒目 ----------------
rep("        ctx.fillStyle = ((r + c) % 2 === 0) ? 'rgba(118,148,68,.55)' : 'rgba(98,128,58,.55)';",
    "        ctx.fillStyle = ((r + c) % 2 === 0) ? 'rgba(118,148,68,.38)' : 'rgba(98,128,58,.38)';",
    "网格变淡")

# 箭头：从格子边缘往外画
rep("""    const len = size * 0.98;                     // 明显伸出格子外
    const tailX = cx - v[0] * size * 0.22, tailY = cy + v[1] * size * 0.22;
    const tipX = cx + v[0] * len, tipY = cy - v[1] * len;""",
"""    const len = size * 1.05;                     // 明显伸出格子外
    const startD = size * 0.42;                  // 从格子边缘开始，不压住零件本身
    const sx0 = cx + v[0] * startD, sy0 = cy - v[1] * startD;
    const tailX = sx0 - v[0] * size * 0.1, tailY = sy0 + v[1] * size * 0.1;
    const tipX = cx + v[0] * len, tipY = cy - v[1] * len;""", "箭头从边缘起")
rep("""    // 箭杆：深色打底 → 白边 → 本体色（三种背景都看得清）
    ctx.strokeStyle = 'rgba(16,26,20,.85)'; ctx.lineWidth = glow ? 13 : 11;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = glow ? 9 : 7;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = glow ? 6 : 5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();""",
"""    // 箭杆：深色打底 → 白边 → 本体色
    ctx.strokeStyle = 'rgba(16,26,20,.9)'; ctx.lineWidth = glow ? 13 : 11;
    ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = glow ? 9 : 7;
    ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = glow ? 6 : 5;
    ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(tipX, tipY); ctx.stroke();""", "箭杆从边缘起")

# ---------------- 3) 新手引导清单 ----------------
rep("""      const hasPig = Object.keys(state.build.cells).some(k => state.build.cells[k].inner === 'pig');""",
"""      // ---- 3 步新手引导（每步达成即打勾；当前步的零件槽会闪）----
      const keysB = Object.keys(state.build.cells);
      const hasFrame = keysB.some(k => RAP.PARTS[state.build.cells[k].part].structure);
      const hasWheel = keysB.some(k => RAP.PARTS[state.build.cells[k].part].wheel);
      const hasPig = keysB.some(k => state.build.cells[k].inner === 'pig');
      const steps = [
        { txt: '放一块木框', done: hasFrame, part: 'wood_frame' },
        { txt: '装一个轮子', done: hasWheel, part: 'wood_wheel' },
        { txt: '把小猪塞进木框', done: hasPig, part: 'pig' }
      ];
      const cur = steps.findIndex(s => !s.done);
      if (cur >= 0) {
        // 当前步对应的槽位闪一下
        const idx = TRAY.indexOf(steps[cur].part);
        if (idx >= 0) {
          const rr = trayRect(idx);
          const a2 = 0.5 + 0.5 * Math.sin(performance.now() / 220);
          ctx.save(); ctx.globalAlpha = a2;
          ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 3;
          roundRect(rr.x - 4, rr.y - 4, rr.w + 8, rr.h + 8, 10); ctx.stroke();
          ctx.restore();
        }
      }
      // 清单面板（左侧）
      const px = 84, py = 186;
      ctx.fillStyle = 'rgba(12,20,26,.72)';
      roundRect(px, py, 214, 20 + steps.length * 26 + 8, 10); ctx.fill();
      text('建造 3 步', px + 12, py + 20, 13, '#9fd66a', 'left', true);
      steps.forEach((s, i) => {
        const yy = py + 44 + i * 26;
        const isCur = i === cur;
        ctx.fillStyle = s.done ? '#63d97e' : (isCur ? '#ffd93d' : 'rgba(150,170,185,.5)');
        ctx.beginPath(); ctx.arc(px + 20, yy - 4, 7, 0, Math.PI * 2); ctx.fill();
        if (s.done) {
          ctx.strokeStyle = '#0f2a18'; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(px + 16, yy - 4); ctx.lineTo(px + 19, yy); ctx.lineTo(px + 24, yy - 9);
          ctx.stroke();
        }
        text((i + 1) + '. ' + s.txt, px + 34, yy, 13, s.done ? '#9fe0a8' : (isCur ? '#ffe9b0' : '#93a3ae'), 'left', isCur);
      });
      const hasPig2 = hasPig;""", "新手引导清单")

# 原来的"没放猪"提示改成只在第 3 步时出现，且位置抬高避免与槽位名重叠
rep("""      const hasPig = Object.keys(state.build.cells).some(k => state.build.cells[k].inner === 'pig');
      if (!hasPig) {""",
"""      if (!hasPig2) {""", "清理重复变量")
rep("          text('把小猪拖进木框才能出发', r.x + r.w / 2, r.y - 44, 13, '#ffd93d', 'center', true);",
    "          text('把小猪拖进木框', r.x + r.w / 2, r.y - 62, 12, '#ffd93d', 'center', true);", "提示抬高")

p.write_text(t, encoding="utf-8")
print("done")

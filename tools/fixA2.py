"""A 方案第二件：3 步新手引导清单（+ 当前步的零件槽闪烁 + 提示错开）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 在 HUD 的 build 分支里插入引导清单
rep("""    if (state.phase === 'build') {
      // 重心偏移：让玩家知道"车头偏重 / 整体太高\"""",
"""    if (state.phase === 'build') {
      // ---- 3 步新手引导 ----
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
        const idx = TRAY.indexOf(steps[cur].part);
        if (idx >= 0) {
          const rr = trayRect(idx);
          const a2 = 0.5 + 0.5 * Math.sin(performance.now() / 220);
          ctx.save(); ctx.globalAlpha = a2;
          ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 3;
          roundRect(rr.x - 4, rr.y - 4, rr.w + 8, rr.h + 8, 10); ctx.stroke();
          ctx.restore();
          // 当前步名称也显示在槽上方（和悬停提示错开）
          text('▸ ' + steps[cur].txt, rr.x + rr.w / 2, rr.y - 62, 12, '#ffd93d', 'center', true);
        }
      }
      const px = 84, py = 192;
      ctx.fillStyle = 'rgba(12,20,26,.74)';
      roundRect(px, py, 210, 30 + steps.length * 26, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(232,200,122,.35)'; ctx.lineWidth = 1; ctx.stroke();
      text('建造 3 步', px + 12, py + 20, 13, '#9fd66a', 'left', true);
      steps.forEach((s, i) => {
        const yy = py + 46 + i * 26;
        const isCur = i === cur;
        ctx.fillStyle = s.done ? '#63d97e' : (isCur ? '#ffd93d' : 'rgba(150,170,185,.45)');
        ctx.beginPath(); ctx.arc(px + 20, yy - 4, 7, 0, Math.PI * 2); ctx.fill();
        if (s.done) {
          ctx.strokeStyle = '#0f2a18'; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(px + 16, yy - 4); ctx.lineTo(px + 19, yy); ctx.lineTo(px + 24, yy - 9);
          ctx.stroke();
        }
        text((i + 1) + '. ' + s.txt, px + 34, yy, 13,
          s.done ? '#9fe0a8' : (isCur ? '#ffe9b0' : '#93a3ae'), 'left', isCur);
      });

      // 重心偏移：让玩家知道"车头偏重 / 整体太高\"""", "引导清单")

# 原来的"没放猪"闪框提示：删掉（现在由引导清单接管），避免两处提示重叠
rep("""      const hasPig = Object.keys(state.build.cells).some(k => state.build.cells[k].inner === 'pig');
      if (!hasPig) {
        const pigIdx = TRAY.indexOf('pig');
        if (pigIdx >= 0) {
          const r = trayRect(pigIdx);
          const a = 0.55 + 0.45 * Math.sin(performance.now() / 220);
          ctx.save(); ctx.globalAlpha = a;
          ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 3;
          roundRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 10); ctx.stroke();
          ctx.restore();
          text('把小猪拖进木框', r.x + r.w / 2, r.y - 62, 12, '#ffd93d', 'center', true);
        }
      }
""", "", "删掉旧的没放猪提示")

p.write_text(t, encoding="utf-8")
print("done part2")

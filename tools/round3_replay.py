"""第 3 轮 A：失败回放做成真正的镜头回放。

现在的问题：失败回放只是一个绿圆点在屏幕上飘，看不出发生过什么。
改成：重放整段轨迹（车体轮廓 + 车轮轨迹线 + 撞击点标记），镜头跟着回放点走，
并在最后 0.35 秒定格在"出事那一刻"，加一圈冲击波。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

old = """    // 失败回放提示
    if (st.phase === 'resolved' && st.result === 'fail' && st.replay && st.replay.length) {
      state.replayT += elapsed;
      const idx = Math.min(st.replay.length - 1, Math.floor((state.replayT * 0.4) * 20));
      const f = st.replay[Math.min(idx, st.replay.length - 1)];
      ctx.fillStyle = 'rgba(16,22,28,.55)'; ctx.fillRect(0, 0, DW, DH);
      const sp = worldToScreen(f.x, f.y, cam);
      ctx.fillStyle = COL.pig; ctx.beginPath(); ctx.arc(sp.x, sp.y, 16, 0, Math.PI * 2); ctx.fill();
      text('回放 0.4× · ' + failText(st.failReason), DW / 2, 120, 22, '#ffb4a2', 'center', true);
    }"""

new = """    // ---------- 失败回放：整段轨迹 + 镜头跟随 + 定格 ----------
    if (st.phase === 'resolved' && st.result === 'fail' && st.replay && st.replay.length) {
      state.replayT += elapsed;
      const frames = st.replay;
      const speed = 0.45;                        // 回放速度
      const raw = state.replayT * speed * 20;    // 20 fps 采样
      const idx = Math.min(frames.length - 1, Math.floor(raw));
      const f = frames[idx];
      const isLast = idx >= frames.length - 1;

      // 暗化背景
      ctx.fillStyle = 'rgba(8,14,18,.62)'; ctx.fillRect(0, 0, DW, DH);

      // 回放专用镜头（跟着回放点 + 稍微拉近）
      const rcam = { x: f.x + 1.0, y: f.y + 1.2, zoom: 1.9 };

      // 轨迹线
      ctx.save();
      ctx.strokeStyle = 'rgba(160,220,255,.28)';
      ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.beginPath();
      for (let i = 0; i <= idx; i++) {
        const p2 = worldToScreen(frames[i].x, frames[i].y, rcam);
        i === 0 ? ctx.moveTo(p2.x, p2.y) : ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // 回放中的车（画出轮廓）
      const rp = worldToScreen(f.x, f.y, rcam);
      ctx.save();
      ctx.translate(rp.x, rp.y); ctx.rotate(f.a || 0);
      ctx.globalAlpha = 0.9;
      // 车体三格
      for (let k = -1; k <= 1; k++) {
        const bx = k * PPM * rcam.zoom * 0.85;
        ctx.fillStyle = '#c99354';
        roundRect(bx - PPM * rcam.zoom * 0.4, -PPM * rcam.zoom * 0.4,
          PPM * rcam.zoom * 0.8, PPM * rcam.zoom * 0.8, 4); ctx.fill();
        ctx.strokeStyle = '#7a4f22'; ctx.lineWidth = 2; ctx.stroke();
      }
      // 车轮
      ctx.fillStyle = '#20262c';
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(k * PPM * rcam.zoom * 0.85, PPM * rcam.zoom * 0.5, PPM * rcam.zoom * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 定格：出事那一刻的冲击波
      if (isLast) {
        const age = Math.min(1, (raw - (frames.length - 1)) / 12);
        if (age < 1) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,120,90,' + (1 - age).toFixed(2) + ')';
          ctx.lineWidth = 6 * (1 - age) + 1;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, 20 + age * 120, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // 进度条
      const barW = 420, barX = DW / 2 - barW / 2, barY = DH - 92;
      ctx.fillStyle = 'rgba(10,18,24,.85)';
      roundRect(barX, barY, barW, 10, 5); ctx.fill();
      const prog = idx / Math.max(1, frames.length - 1);
      ctx.fillStyle = '#e8816a';
      roundRect(barX, barY, Math.max(6, barW * prog), 10, 5); ctx.fill();

      // 标题
      text('回放 · ' + failText(st.failReason), DW / 2, 120, 22, '#ffb4a2', 'center', true);
      text(isLast ? '出事的那一刻' : (speed.toFixed(2) + '× 慢放'), DW / 2, 148, 13,
        isLast ? '#ffd93d' : 'rgba(200,218,232,.7)', 'center');
    }"""
assert old in t, "replay block not found"
t = t.replace(old, new)

# failText 补 pig_lost
t = t.replace("    return ({ pig_dead: '猪受伤过重', out_of_bounds: '掉出地图', stuck: '卡住了：动力或重心不对',\n"
              "              timeout: '超时', empty: '没放零件' })[reason] || reason;",
              "    return ({ pig_dead: '猪受伤过重', pig_lost: '小猪掉队了', out_of_bounds: '掉出地图',\n"
              "              stuck: '卡住了：动力或重心不对', timeout: '超时', empty: '没放零件' })[reason] || reason;")

p.write_text(t, encoding="utf-8")
print("失败回放重做完成")

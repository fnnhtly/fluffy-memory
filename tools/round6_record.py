"""第 6 轮 A：新纪录提示
通关时如果破了该关最佳时间，结算卡片上显示「新纪录！」徽章 + 刷新动画。
需要在 saveProgress 之前读取旧记录做比较。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 结算时判断是否新纪录（要在写存档之前读旧值）
rep("""        if (state.run.result === 'win') {
          saveProgress(level().levelId, state.run.stars, state.run.time);   // 记录星级与最佳时间
        }""",
"""        if (state.run.result === 'win') {
          // 先读旧记录，判断是否破纪录，再写
          let oldBest = null, oldStars = 0;
          try {
            const all = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {};
            const rec = all[level().levelId];
            if (rec) { oldBest = rec.best; oldStars = rec.stars; }
          } catch (e) {}
          state.newBest = (oldBest === null || state.run.time < oldBest);
          state.oldBest = oldBest;
          state.newStarRecord = state.run.stars > oldStars;
          saveProgress(level().levelId, state.run.stars, state.run.time);
        } else {
          state.newBest = false;
          state.newStarRecord = false;
        }""", "新纪录判定")

# 2) 结算卡片上画「新纪录！」徽章
rep("""    // 金币 + 评级（滑入后 0.55s 登场）""",
"""    // 新纪录徽章（滑入后 0.7s 登场，带轻微弹跳）
    if (win && state.newBest) {
      const bt = Math.max(0, Math.min(1, ((state.resultT || 0) - 0.7) * 4));
      if (bt > 0) {
        const scale = 1 + 0.25 * Math.sin(Math.PI * Math.min(1, bt * 1.6)) * (1 - bt * 0.5);
        ctx.save();
        ctx.globalAlpha = Math.min(1, bt * 2);
        ctx.translate(X + W - 150, cardY + 74);
        ctx.scale(scale, scale);
        const bw2 = 168, bh2 = 40;
        ctx.fillStyle = '#ffd93d';
        roundRect(-bw2 / 2, -bh2 / 2, bw2, bh2, 10); ctx.fill();
        ctx.strokeStyle = '#8a6a10'; ctx.lineWidth = 2; ctx.stroke();
        text('★ 新纪录！', 0, 7, 18, '#5a4300', 'center', true);
        ctx.restore();
        // 旧纪录对比
        if (state.oldBest) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, bt * 1.6);
          text('旧纪录 ' + state.oldBest.toFixed(2) + ' s', X + W - 150, cardY + 112, 12, '#b6ff9e', 'center');
          ctx.restore();
        }
      }
    }
    // 星级提升提示
    if (win && state.newStarRecord && !state.newBest) {
      const bt2 = Math.max(0, Math.min(1, ((state.resultT || 0) - 0.7) * 4));
      if (bt2 > 0) {
        ctx.save();
        ctx.globalAlpha = bt2;
        ctx.fillStyle = 'rgba(255,217,61,.9)';
        roundRect(X + W - 234, cardY + 54, 168, 34, 9); ctx.fill();
        text('星级提升！', X + W - 150, cardY + 77, 16, '#5a4300', 'center', true);
        ctx.restore();
      }
    }

    // 金币 + 评级（滑入后 0.55s 登场）""", "新纪录徽章")

p.write_text(t, encoding="utf-8")
print("新纪录提示完成")

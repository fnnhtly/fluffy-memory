"""打磨·结算界面升级（第 3 项）：
- 卡片滑入后加"金币数 + 评级 S/A/B/C"
- 星级、徽章、按钮按顺序登场（0.25s / 0.4s / 0.55s 延迟）
- 失败卡片显示"掉队原因"的图标化提示
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 在结算卡片绘制里插入金币与评级
rep("""    // 底部两个按钮（跟随卡片滑入）""",
"""    // 金币 + 评级（滑入后 0.55s 登场）
    const coinT = Math.max(0, Math.min(1, ((state.resultT || 0) - 0.55) * 4));
    if (coinT > 0) {
      ctx.save();
      ctx.globalAlpha = coinT;
      const cy2 = cardY + H + 8;
      // 金币：★ 数 + 木箱数 → 金币
      const coins = (win ? stars * 50 : 0) + (win ? st.boxesGot * 30 : 0);
      const badgeX = X + W / 2 - 150;
      ctx.fillStyle = '#f0c040';
      ctx.beginPath(); ctx.arc(badgeX, cy2, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a6a10';
      ctx.beginPath(); ctx.arc(badgeX, cy2, 9, 0, Math.PI * 2); ctx.fill();
      text('×' + coins, badgeX + 26, cy2 + 7, 20, '#ffd93d', 'left', true);
      // 评级
      const grade = !win ? 'F' : (stars >= 3 ? 'S' : (stars === 2 ? 'A' : 'B'));
      const gx = X + W / 2 + 130;
      ctx.fillStyle = win ? (grade === 'S' ? '#ffd93d' : (grade === 'A' ? '#8fd66a' : '#7fb0d0')) : '#e8816a';
      ctx.beginPath(); ctx.arc(gx, cy2, 19, 0, Math.PI * 2); ctx.fill();
      text(grade, gx, cy2 + 8, 22, '#12222c', 'center', true);
      text('评级', gx, cy2 + 36, 10, '#9fb2c2', 'center');
      ctx.restore();
    }

    // 底部两个按钮（跟随卡片滑入）""", "金币+评级")

p.write_text(t, encoding="utf-8")
print("done")

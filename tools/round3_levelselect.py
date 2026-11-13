"""第 3 轮 B：关卡选择界面（替换顶部小页签）

- 在建造界面按 ESC 或点左上"关卡"按钮 → 打开选关页
- 每个关卡一张卡：关卡号、名字、★★★ 条件、已获星级（存在 localStorage）、最佳时间
- 点卡片进入该关；点空白关闭
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) 星级存档 ----------
rep("  const levels = window.RAP_LEVELS;",
"""  const levels = window.RAP_LEVELS;

  // ---------- 关卡进度（localStorage，关掉页面也在） ----------
  const SAVE_KEY = 'rap-progress-v1';
  let progress = {};
  try {
    progress = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {};
  } catch (e) { progress = {}; }
  function saveProgress(levelId, stars, time) {
    const cur = progress[levelId] || { stars: 0, best: null };
    if (stars > cur.stars) cur.stars = stars;
    if (!cur.best || time < cur.best) cur.best = time;
    progress[levelId] = cur;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch (e) {}
  }""", "进度存档")

# ---------- 2) 状态位 ----------
rep("    camState: { x: 0, y: 0, zoom: 1.7 }, shake: 0, flash: 0, vignette: 0,",
    "    camState: { x: 0, y: 0, zoom: 1.7 }, shake: 0, flash: 0, vignette: 0, levelSelect: false,", "状态位")

# ---------- 3) 结算时写进度 ----------
rep("""        state.slowmo = Math.max(state.slowmo, 0.55);   // 过关瞬间放慢一下""",
"""        state.slowmo = Math.max(state.slowmo, 0.55);   // 过关瞬间放慢一下
        if (state.run.result === 'win') {
          saveProgress(level().levelId, state.run.stars, state.run.time);   // 记录星级与最佳时间
        }""", "结算写进度")

# ---------- 4) 选关页绘制 ----------
rep("  function drawHelp() {",
"""  function drawLevelSelect() {
    if (!state.levelSelect) return;
    ctx.fillStyle = 'rgba(6,12,16,.82)'; ctx.fillRect(0, 0, DW, DH);
    text('选择关卡', DW / 2, 92, 30, '#ffe9b0', 'center', true);
    text('★★ 拿木箱　★★★ 每关的特殊条件', DW / 2, 124, 13, '#9fb2c2', 'center');

    const CW = 216, CH = 210, GAP = 18;
    const totalW = levels.length * CW + (levels.length - 1) * GAP;
    levels.forEach((lv, i) => {
      const x = (DW - totalW) / 2 + i * (CW + GAP);
      const y = 168;
      const pr = progress[lv.levelId] || { stars: 0, best: null };
      const isCur = i === state.levelIndex;
      // 卡面
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
      ctx.fillStyle = isCur ? '#1c4a34' : '#152a33';
      roundRect(x, y, CW, CH, 14); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = isCur ? 'rgba(160,255,180,.75)' : 'rgba(232,200,122,.32)';
      ctx.lineWidth = isCur ? 2.5 : 1.5; ctx.stroke();
      // 关卡号
      text(lv.levelId, x + CW / 2, y + 42, 26, isCur ? '#b6ff9e' : '#e8f2fa', 'center', true);
      text(lv.name, x + CW / 2, y + 70, 15, '#cfe0ee', 'center');
      // 星级
      for (let k = 0; k < 3; k++) {
        const cx2 = x + CW / 2 - 44 + k * 44, cy2 = y + 104;
        ctx.fillStyle = k < pr.stars ? '#ffd93d' : 'rgba(255,255,255,.14)';
        ctx.beginPath();
        for (let q = 0; q < 10; q++) {
          const ang = -Math.PI / 2 + q * Math.PI / 5;
          const rad = (q % 2 === 0) ? 15 : 6.5;
          const px2 = cx2 + Math.cos(ang) * rad, py2 = cy2 + Math.sin(ang) * rad;
          q === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
        }
        ctx.closePath(); ctx.fill();
      }
      // 最佳时间
      text(pr.best ? '最佳 ' + pr.best.toFixed(2) + ' s' : '未通关',
        x + CW / 2, y + 140, 12, pr.best ? '#9fe0a8' : '#7f97a6', 'center');
      // ★★★ 条件
      const chNames = { none: '无 ★★★', pumpPress: '不按打气筒', energyLeft: '能量剩 ≥ 30',
                        noFlip: '不翻车', motorUse: '不用马达' };
      text('★★★：' + (chNames[(lv.challenge || {}).type] || '—'),
        x + CW / 2, y + 168, 11, '#8fb6c9', 'center');
      // 零件箱
      const boxTxt = Object.keys(lv.partsBox || {})
        .map(k => (RAP.PARTS[k] ? RAP.PARTS[k].label : k) + lv.partsBox[k]).join(' ');
      text(boxTxt, x + CW / 2, y + 190, 10, 'rgba(200,218,232,.55)', 'center');
    });
    text('点卡片进入关卡　·　按 ESC 或点空白关闭', DW / 2, DH - 54, 12, '#7f97a6', 'center');
  }

  function levelCardRect(i) {
    const CW = 216, CH = 210, GAP = 18;
    const totalW = levels.length * CW + (levels.length - 1) * GAP;
    return { x: (DW - totalW) / 2 + i * (CW + GAP), y: 168, w: CW, h: CH };
  }

  function drawHelp() {""", "选关页绘制")

# ---------- 5) 挂到 frame ----------
rep("    drawHelp();", "    drawLevelSelect();\n    drawHelp();", "挂到 frame")

p.write_text(t, encoding="utf-8")
print("选关页完成")

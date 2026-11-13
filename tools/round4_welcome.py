"""第 4 轮 A：首次进入的欢迎引导（3 页图文）

现在第一次打开演示是完全空白的三无状态：不知道这是干什么的、怎么玩、目标是什么。
做一个 3 页的欢迎卡片（只显示一次，存在 localStorage），并可从选关页重新打开。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 状态：欢迎页
rep("    camState: { x: 0, y: 0, zoom: 1.7 }, shake: 0, flash: 0, vignette: 0, levelSelect: false,",
    "    camState: { x: 0, y: 0, zoom: 1.7 }, shake: 0, flash: 0, vignette: 0, levelSelect: false,\n"
    "    welcome: 0,        // 0=关闭，1..3=第几页", "欢迎页状态")

# 2) 首次自动打开
rep("  window.__rap = { state, RAP, levels, startLevel, launch };",
"""  // 首次进入自动显示欢迎引导
  try {
    if (!localStorage.getItem('rap-welcomed-v1')) state.welcome = 1;
  } catch (e) { state.welcome = 1; }

  window.__rap = { state, RAP, levels, startLevel, launch };""", "首次自动打开")

# 3) 欢迎页绘制 + 交互矩形
rep("  function drawLevelSelect() {",
"""  const WELCOME_PAGES = [
    {
      title: '欢迎来到「滚蛋吧！猪」',
      lines: [
        '你是一个猪车工程师。',
        '用木框搭车、装轮子、把小猪塞进木框里，',
        '让车带着小猪跑到终点旗子。',
        '',
        '物理是真的：重心偏了会翻、装太重会跑不动。'
      ],
      art: 'car'
    },
    {
      title: '建造 · 三步就能出发',
      lines: [
        '1. 点底部零件槽 → 点网格放零件（必须贴着木框）',
        '2. 把「小猪」拖进一个木框里（框是空的，猪坐进去）',
        '3. 点右侧蓝色对勾 → 出发',
        '',
        '拖动已放的零件可以搬走；右键 / R 换喷气方向；',
        '最右边的橡皮按下就能擦掉。'
      ],
      art: 'grid'
    },
    {
      title: '跑起来之后',
      lines: [
        '左上红钮 = 暂停，绿钮 = 回建造（零件保留）',
        '右下「刹」= 按住刹车，随时能停',
        '底部彩色按钮 = 同色同类零件一起启动（打气筒等）',
        '',
        '★ 通关　★★ 拿到木箱　★★★ 每关的特殊条件',
        '按 L 打开选关，进度会保存。'
      ],
      art: 'run'
    }
  ];

  function welcomeBtnRect() {
    return { x: DW / 2 + 120, y: 508, w: 180, h: 56 };
  }
  function welcomeSkipRect() {
    return { x: DW / 2 - 300, y: 508, w: 180, h: 56 };
  }

  function drawWelcome() {
    if (!state.welcome) return;
    const page = WELCOME_PAGES[state.welcome - 1];
    if (!page) { state.welcome = 0; return; }
    ctx.fillStyle = 'rgba(6,12,16,.86)'; ctx.fillRect(0, 0, DW, DH);

    const W = 760, H = 430, X = (DW - W) / 2, Y = 130;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#14262f'; roundRect(X, Y, W, H, 18); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(232,200,122,.5)'; ctx.lineWidth = 2; ctx.stroke();

    text(page.title, X + 40, Y + 58, 26, '#ffe9b0', 'left', true);

    // 左侧插图
    if (page.art === 'car') {
      const cx2 = X + 130, cy2 = Y + 190;
      for (let k = -1; k <= 1; k++) {
        drawPartShape('wood_frame', cx2 + k * 46, cy2, 46 * 0.84, 0, 3);
      }
      drawPig(cx2, cy2, 46 * 0.3, 0, 'happy');
      drawPartShape('wood_wheel', cx2 - 46, cy2 + 40, 46 * 0.7, 0);
      drawPartShape('wood_wheel', cx2 + 46, cy2 + 40, 46 * 0.7, 0);
    } else if (page.art === 'grid') {
      for (let r2 = 0; r2 < 4; r2++) {
        for (let c2 = 0; c2 < 4; c2++) {
          const gx = X + 62 + c2 * 34, gy = Y + 140 + r2 * 34;
          ctx.fillStyle = (r2 === 1 && c2 === 1) ? 'rgba(150,220,120,.7)' : 'rgba(120,150,110,.32)';
          roundRect(gx, gy, 30, 30, 5); ctx.fill();
        }
      }
      drawPartShape('wood_frame', X + 62 + 34 + 15, Y + 140 + 34 + 15, 28, 0, 3);
      drawPig(X + 62 + 34 + 15, Y + 140 + 34 + 15, 10, 0, 'normal');
    } else {
      ctx.fillStyle = '#4a9be0';
      ctx.beginPath(); ctx.arc(X + 130, Y + 190, 34, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(X + 116, Y + 191); ctx.lineTo(X + 126, Y + 201); ctx.lineTo(X + 146, Y + 178);
      ctx.stroke();
      ctx.fillStyle = '#63bf3f';
      ctx.beginPath(); ctx.arc(X + 130, Y + 268, 24, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0513c';
      ctx.beginPath(); ctx.arc(X + 130, Y + 216, 24, 0, Math.PI * 2); ctx.fill();
    }

    // 右侧文字
    page.lines.forEach((ln, i) => {
      text(ln, X + 250, Y + 108 + i * 30, 15, ln ? '#d8e8f4' : '#000', 'left');
    });

    // 页码点
    for (let i = 0; i < WELCOME_PAGES.length; i++) {
      ctx.fillStyle = i === state.welcome - 1 ? '#ffe9b0' : 'rgba(255,255,255,.22)';
      ctx.beginPath();
      ctx.arc(X + W / 2 - 24 + i * 24, Y + H - 30, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 按钮
    const bk = welcomeSkipRect(), bn = welcomeBtnRect();
    ctx.fillStyle = 'rgba(24,34,42,.9)';
    roundRect(bk.x, bk.y, bk.w, bk.h, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(200,218,232,.4)'; ctx.lineWidth = 1.5; ctx.stroke();
    text('跳过', bk.x + bk.w / 2, bk.y + 36, 17, '#c3d4e2', 'center');
    ctx.fillStyle = '#4a9be0';
    roundRect(bn.x, bn.y, bn.w, bn.h, 12); ctx.fill();
    const last = state.welcome >= WELCOME_PAGES.length;
    text(last ? '开始搭车！' : '下一步 →', bn.x + bn.w / 2, bn.y + 36, 17, '#ffffff', 'center', true);
  }

  function drawLevelSelect() {""", "欢迎页绘制")

# 4) 挂到 frame（在选关页之前）
rep("    drawLevelSelect();", "    drawWelcome();\n    drawLevelSelect();", "挂到 frame")

p.write_text(t, encoding="utf-8")
print("欢迎页完成")

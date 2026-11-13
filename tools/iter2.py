"""迭代第二部分：结算卡片滑入 + 三徽章 + 音效 + 猪受伤表情。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# ---------------- 音效（WebAudio 合成，无素材） ----------------
t = t.replace("  const levels = window.RAP_LEVELS;\n  const level = () => levels[state.levelIndex];",
"""  const levels = window.RAP_LEVELS;
  const level = () => levels[state.levelIndex];

  // ---------- 音效：WebAudio 现场合成，不依赖任何素材 ----------
  const SFX = (() => {
    let ac = null;
    const ensure = () => {
      try {
        if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
        if (ac.state === 'suspended') ac.resume();
      } catch (e) { ac = null; }
      return ac;
    };
    function tone(freq, dur, type, gain, slideTo) {
      const a = ensure(); if (!a) return;
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'triangle';
      o.frequency.setValueAtTime(freq, a.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(gain || 0.12, a.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + dur + 0.02);
    }
    function noise(dur, gain) {
      const a = ensure(); if (!a) return;
      const n = Math.floor(a.sampleRate * dur);
      const buf = a.createBuffer(1, n, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = a.createBufferSource(); src.buffer = buf;
      const g = a.createGain(); g.gain.value = gain || 0.08;
      src.connect(g); g.connect(a.destination); src.start();
    }
    return {
      place() { tone(520, 0.07, 'square', 0.07); },
      deny() { tone(180, 0.12, 'sawtooth', 0.07, 120); },
      launch() { noise(0.25, 0.09); tone(220, 0.25, 'sine', 0.09, 520); },
      box() { tone(880, 0.09, 'sine', 0.1); tone(1320, 0.09, 'sine', 0.06); },
      win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.1), i * 110)); },
      fail() { tone(300, 0.22, 'sawtooth', 0.09, 140); setTimeout(() => tone(220, 0.28, 'sawtooth', 0.08, 110), 140); },
      pump() { tone(300, 0.1, 'square', 0.06, 700); },
      hurt() { tone(160, 0.16, 'square', 0.08, 90); }
    };
  })();""")

# 触发点：放置 / 拒绝 / 发射 / 吃箱 / 胜负 / 打气筒
t = t.replace("""    const res = RAP.tryPlace(level(), state.build, part, r, c);
    if (!res.ok) {""", """    const res = RAP.tryPlace(level(), state.build, part, r, c);
    if (res.ok) SFX.place(); else SFX.deny();
    if (!res.ok) {""")
t = t.replace("""    state.run = RAP.createRun(level(), state.build);
    state.phase = 'run';""", """    state.run = RAP.createRun(level(), state.build);
    state.phase = 'run';
    state.resultT = 0;
    SFX.launch();""")
t = t.replace("""      if (state.run && state.run.phase === 'resolved' && state.phase === 'run') state.phase = 'resolved';""",
"""      if (state.run && state.run.phase === 'resolved' && state.phase === 'run') {
        state.phase = 'resolved';
        state.resultT = 0;
        if (state.run.result === 'win') SFX.win(); else SFX.fail();
      }""")
t = t.replace("""        if (hit(rect, p.x, p.y)) { RAP.pressInteract(state.run, i + 1); return; }""",
"""        if (hit(rect, p.x, p.y)) { RAP.pressInteract(state.run, i + 1); SFX.pump(); return; }""")

# 吃箱 / 受伤音效：比较上一帧状态
t = t.replace("""      drawRun(dt);""", """      const prevBox = state.run ? state.run.boxesGot : 0;
      const prevHp = state.run ? state.run.pigHP : 3;
      drawRun(dt);
      if (state.run) {
        if (state.run.boxesGot > prevBox) SFX.box();
        if (state.run.pigHP < prevHp) SFX.hurt();
      }""")

# ---------------- 结算：滑入 + 三徽章 ----------------
old_res = t[t.find("  function drawResult() {"):t.find("  function drawToast() {")]
assert old_res
new_res = '''  function badge(cx, cy, r, ring, fill) {
    ctx.fillStyle = ring; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2); ctx.fill();
  }

  function drawResult(elapsed) {
    const st = state.run;
    ctx.fillStyle = 'rgba(8,14,10,.58)'; ctx.fillRect(0, 0, DW, DH);
    const win = st.result === 'win';

    // 卡片从顶部滑入
    state.resultT = Math.min(1, (state.resultT || 0) + elapsed);
    const ease = 1 - Math.pow(1 - state.resultT, 3);
    const cardY = 150 - (1 - ease) * 420;

    const W = 760, H = 372, X = DW / 2 - W / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8;
    ctx.fillStyle = win ? '#20623a' : '#5c2c2c';
    roundRect(X, cardY, W, H, 18); ctx.fill();
    ctx.restore();
    ctx.fillStyle = win ? '#63d97e' : '#e8816a';
    roundRect(X, cardY + 6, W, 8, 4); ctx.fill();

    text(win ? '到达终点！' : '这一趟失败了', X + 42, cardY + 86, 36, win ? '#b6ff9e' : '#ffb4a2', 'left', true);

    // 三枚圆形徽章：猪 / 星 / 秒表
    const by = cardY + 172;
    const bx = [X + 168, X + W / 2, X + W - 168];
    badge(bx[0], by, 46, '#3f8a4e', '#6fc25a');
    drawPig(bx[0], by, 26, 0);
    badge(bx[1], by, 46, '#3f8a4e', win ? '#ffe066' : '#4a5a4a');
    // 星形
    ctx.fillStyle = win ? '#ffd93d' : '#7c8a7c';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const ang = -Math.PI / 2 + k * Math.PI / 5;
      const rad = (k % 2 === 0) ? 24 : 10;
      ctx[k === 0 ? 'moveTo' : 'lineTo'](bx[1] + Math.cos(ang) * rad, by + Math.sin(ang) * rad);
    }
    ctx.closePath(); ctx.fill();
    badge(bx[2], by, 46, '#3f8a4e', '#f0c040');
    ctx.fillStyle = '#6a5410';
    ctx.fillRect(bx[2] - 2, by - 18, 4, 20);
    ctx.fillRect(bx[2] - 2, by - 2, 12, 4);

    // 星级（三颗小星，间隔 0.3s 依次弹出）
    const stars = win ? st.stars : 0;
    for (let i = 0; i < 3; i++) {
      const pop = Math.max(0, Math.min(1, (state.resultT - 0.25 - i * 0.12) * 4));
      if (pop <= 0) continue;
      const cx = X + W / 2 - 84 + i * 84, cy = cardY + 268;
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(pop, pop);
      ctx.fillStyle = i < stars ? '#ffd93d' : 'rgba(255,255,255,.16)';
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const ang = -Math.PI / 2 + k * Math.PI / 5;
        const rad = (k % 2 === 0) ? 26 : 11;
        ctx[k === 0 ? 'moveTo' : 'lineTo'](Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    text(`用时 ${st.time.toFixed(2)} s`, X + 42, cardY + 322, 16, '#dff0d8', 'left');
    text(`木箱 ${st.boxesGot}/${st.boxes.length}`, X + W / 2 - 40, cardY + 322, 16, '#dff0d8', 'center');
    text(`能量剩 ${Math.round(st.car.energy)}`, X + W - 42, cardY + 322, 16, '#dff0d8', 'right');

    if (!win) text('原因：' + failText(st.failReason), X + 42, cardY + 352, 15, '#ffc9bb', 'left');
    else {
      const ch = level().challenge || {};
      const names = { none: '本关没有 ★★★', pumpPress: '不按打气筒通关', energyLeft: '能量剩 ≥ 30',
                      noFlip: '全程不翻车', motorUse: '不用马达通关' };
      text('★★★ 条件：' + (names[ch.type] || ch.type), X + 42, cardY + 352, 15,
        stars === 3 ? '#b6ff9e' : '#9fb2c2', 'left');
    }

    // 底部两个按钮（跟随卡片滑入）
    const btnY = cardY + H + 34;
    ctx.fillStyle = '#63bf3f'; roundRect(DW / 2 - 300, btnY, 260, 72, 14); ctx.fill();
    text('重试（保留拼装）', DW / 2 - 170, btnY + 44, 18, '#fff', 'center');
    const hasNext = state.levelIndex < levels.length - 1;
    ctx.fillStyle = hasNext ? '#63bf3f' : '#5a6450';
    roundRect(DW / 2 + 40, btnY, 260, 72, 14); ctx.fill();
    text(hasNext ? '下一关' : '已是最后一关', DW / 2 + 170, btnY + 44, 18, '#fff', 'center');
    state.resultBtnY = btnY;
  }

'''
t = t.replace(old_res, new_res)

# 结算按钮命中要跟随滑入位置
t = t.replace("""    if (state.phase === 'resolved') {
      if (name === 'retry') return { x: DW / 2 - 300, y: 552, w: 260, h: 76 };
      if (name === 'next') return { x: DW / 2 + 40, y: 552, w: 260, h: 76 };
    }""",
"""    if (state.phase === 'resolved') {
      const y = state.resultBtnY || 556;
      if (name === 'retry') return { x: DW / 2 - 300, y, w: 260, h: 72 };
      if (name === 'next') return { x: DW / 2 + 40, y, w: 260, h: 72 };
    }""")

# drawResult 需要 elapsed
t = t.replace("      if (state.phase === 'resolved') drawResult();",
              "      if (state.phase === 'resolved') drawResult(dt);")

# 猪受伤表情：在 drawPig 里根据 hp 画 X 眼
t = t.replace("""    // 眼睛
    ctx.fillStyle = '#1d2b1a';
    ctx.beginPath(); ctx.arc(-r * 0.34, -r * 0.18, r * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.34, -r * 0.18, r * 0.13, 0, Math.PI * 2); ctx.fill();""",
"""    // 眼睛（受伤时变成 ×）
    if (hurt) {
      ctx.strokeStyle = '#1d2b1a'; ctx.lineWidth = Math.max(2, r * 0.13); ctx.lineCap = 'round';
      for (const ex of [-r * 0.34, r * 0.34]) {
        ctx.beginPath();
        ctx.moveTo(ex - r * 0.14, -r * 0.32); ctx.lineTo(ex + r * 0.14, -r * 0.04);
        ctx.moveTo(ex + r * 0.14, -r * 0.32); ctx.lineTo(ex - r * 0.14, -r * 0.04);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#1d2b1a';
      ctx.beginPath(); ctx.arc(-r * 0.34, -r * 0.18, r * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.34, -r * 0.18, r * 0.13, 0, Math.PI * 2); ctx.fill();
    }""")
t = t.replace("  function drawPig(cx, cy, r, angle) {", "  function drawPig(cx, cy, r, angle, hurt) {")
t = t.replace("    drawPig(pp.x, pp.y, PPM * cam.zoom * 0.36, -car.a);",
              "    drawPig(pp.x, pp.y, PPM * cam.zoom * 0.36, -car.a, state.run.pigHP < 3);")

p.write_text(t, encoding="utf-8")
print("迭代 E/G 完成")

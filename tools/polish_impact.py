"""打磨·失败回放升级（第 4 项）：
- 撞击瞬间：0.25 倍慢动作（只放缓，不改变逻辑）
- 碎片：撞击点飞出一组小块（纯视觉，抛物线 + 旋转 + 淡出）
- 失败回放时叠加"撞击点红圈"
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 状态：碎片数组 + 慢动作
rep("    helpOpen: false, paused: false, bounce: null,",
    "    helpOpen: false, paused: false, bounce: null, debris: [], slowmo: 0, lastImpact: null,", "状态位")

# 2) 每帧：更新碎片 + 慢动作衰减
rep("""      if (state.run && state.run.phase === 'run' && !state.paused) {""",
"""      // 慢动作衰减（撞击后 0.25 倍，0.35 秒内恢复）
      if (state.slowmo > 0) state.slowmo = Math.max(0, state.slowmo - dt);
      // 碎片：抛物线 + 旋转 + 淡出
      if (state.debris.length) {
        state.debris.forEach(d => {
          d.vy -= 16 * dt;
          d.x += d.vx * dt; d.y += d.vy * dt;
          d.a += d.w * dt; d.life -= dt;
        });
        state.debris = state.debris.filter(d => d.life > 0);
      }
      if (state.run && state.run.phase === 'run' && !state.paused) {""", "碎片更新")

# 3) 慢动作作用在物理步进的时间上
rep("""        state.run.acc = (state.run.acc || 0) + dt;
        let guard = 0;
        while (state.run.acc >= 1 / 60 && guard++ < 5) {
          state.run.acc -= 1 / 60;
          RAP.step(state.run, 1 / 60);
        }""",
"""        const timeScale = state.slowmo > 0 ? 0.3 : 1;
        state.run.acc = (state.run.acc || 0) + dt * timeScale;
        let guard = 0;
        while (state.run.acc >= 1 / 60 && guard++ < 5) {
          state.run.acc -= 1 / 60;
          RAP.step(state.run, 1 / 60);
          // 撞击检测（用事件流，避免改物理）
          const evs = state.run.events || [];
          if (evs.length !== (state.lastEventLen || 0)) {
            for (let i = state.lastEventLen || 0; i < evs.length; i++) {
              if (evs[i].indexOf('impact') === 0) {
                state.slowmo = 0.35;
                spawnDebris(state.run.car.x, state.run.car.y + 0.4);
              }
            }
            state.lastEventLen = evs.length;
          }
        }""", "慢动作 + 撞击触发")

# 4) 碎片生成 + 绘制
rep("  function drawToast() {",
"""  function spawnDebris(wx, wy) {
    for (let i = 0; i < 10; i++) {
      state.debris.push({
        x: wx, y: wy,
        vx: (Math.random() - 0.5) * 6,
        vy: 1 + Math.random() * 4,
        a: Math.random() * 6.28,
        w: (Math.random() - 0.5) * 14,
        size: 3 + Math.random() * 5,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        color: Math.random() > 0.5 ? '#c08a4a' : '#8a5f30'
      });
    }
  }

  function drawDebris(cam) {
    if (!state.debris.length) return;
    state.debris.forEach(d => {
      const p = worldToScreen(d.x, d.y, cam);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, d.life / 0.5));
      ctx.translate(p.x, p.y); ctx.rotate(d.a);
      ctx.fillStyle = d.color;
      ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
      ctx.restore();
    });
  }

  function drawToast() {""", "碎片函数")

# 5) 在 drawRun 里画碎片
rep("""    // 终点旗""", """    drawDebris(cam);

    // 终点旗""", "画碎片")

# 6) 慢动作提示
rep("      if (state.phase === 'resolved') drawResult(dt);",
"""      if (state.slowmo > 0 && state.phase === 'run') {
        ctx.fillStyle = 'rgba(232,200,122,.08)'; ctx.fillRect(0, 0, DW, DH);
      }
      if (state.phase === 'resolved') drawResult(dt);""", "慢动作覆盖")

p.write_text(t, encoding="utf-8")
print("done")

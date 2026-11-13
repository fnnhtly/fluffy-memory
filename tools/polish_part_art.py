"""打磨·零件视觉重做（第 1 项）：
- 木框：木纹 + 铁角包边 + 内壁阴影
- 木轮：辐条 + 木圈；铁轮：金属辐条 + 铆钉
- 电池：电量条（inner 时按剩余能量显示）
- 马达：出轴 + 散热槽
- 打气筒：筒身高光 + 压力表
- 小猪：腮红 + 耳朵内耳
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

start = t.find("  function drawPartShape(part, cx, cy, size, dir, hp) {")
end = t.find("  function drawBuildCar() {")
assert start > 0 and end > start

new_fn = '''  function drawPartShape(part, cx, cy, size, dir, hp) {
    const def = RAP.PARTS[part];
    if (!def) {
      ctx.fillStyle = 'rgba(230,236,242,.9)';
      roundRect(cx - size / 2, cy - size / 2, size, size, 4); ctx.fill();
      return;
    }
    const h = size / 2;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate((dir || 0) * Math.PI / 2);

    if (def.structure) {
      /* ---------- 中空木框：木纹 + 铁角包边 + 内壁阴影 ---------- */
      const bw = size * 0.22;
      // 四条边框（木色，带一点渐变感：上浅下深）
      ctx.fillStyle = '#c99354';
      ctx.fillRect(-h, -h, size, bw);
      ctx.fillRect(-h, -h, bw, size);
      ctx.fillStyle = '#b57f42';
      ctx.fillRect(-h, h - bw, size, bw);
      ctx.fillRect(h - bw, -h, bw, size);
      // 木纹
      ctx.strokeStyle = 'rgba(110,72,34,.45)'; ctx.lineWidth = Math.max(1, size * 0.032);
      ctx.beginPath();
      ctx.moveTo(-h + bw, -h + bw * 0.45); ctx.lineTo(h - bw, -h + bw * 0.45);
      ctx.moveTo(-h + bw, h - bw * 0.45); ctx.lineTo(h - bw, h - bw * 0.45);
      ctx.stroke();
      // 内壁阴影（凹进去的深度）
      ctx.strokeStyle = 'rgba(58,38,18,.6)'; ctx.lineWidth = Math.max(1.5, size * 0.05);
      ctx.strokeRect(-h + bw, -h + bw, size - bw * 2, size - bw * 2);
      // 铁角包边（四角）
      const cn = size * 0.1;
      ctx.fillStyle = '#6f7a86';
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(sx * h, sy * h);
        ctx.lineTo(sx * (h - cn * 2.2), sy * h);
        ctx.lineTo(sx * h, sy * (h - cn * 2.2));
        ctx.closePath(); ctx.fill();
      }
      // 外描边
      ctx.strokeStyle = '#7a4f22'; ctx.lineWidth = Math.max(1.5, size * 0.055);
      ctx.strokeRect(-h, -h, size, size);
      // 挂点铆钉
      for (const [dx, dy] of [[-h + bw * 0.5, -h + bw * 0.5], [h - bw * 0.5, h - bw * 0.5]]) {
        ctx.fillStyle = '#3c4650';
        ctx.beginPath(); ctx.arc(dx, dy, size * 0.045, 0, Math.PI * 2); ctx.fill();
      }
      // 阶段损坏：裂纹 / 破损
      const stage = (hp === undefined || hp === null) ? 3 : hp;
      if (stage <= 2) {
        ctx.strokeStyle = 'rgba(28,18,10,.8)'; ctx.lineWidth = Math.max(1.2, size * 0.035);
        ctx.beginPath();
        ctx.moveTo(-h + bw * 0.5, -h + bw * 0.5);
        ctx.lineTo(-h * 0.15, h * 0.05);
        ctx.lineTo(h * 0.2, -h * 0.2);
        ctx.stroke();
      }
      if (stage <= 1) {
        ctx.fillStyle = 'rgba(28,18,10,.32)';
        ctx.fillRect(-h, -h, size, size);
        ctx.strokeStyle = 'rgba(28,18,10,.85)'; ctx.lineWidth = Math.max(1.5, size * 0.04);
        ctx.beginPath();
        ctx.moveTo(h - bw, -h + bw); ctx.lineTo(h * 0.2, h * 0.15);
        ctx.stroke();
      }

    } else if (def.pig) {
      /* ---------- 小猪 ---------- */
      const r = size * 0.34;
      // 耳朵
      ctx.fillStyle = '#5fae4c';
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sx * r * 0.58, -r * 0.82, r * 0.29, 0, Math.PI * 2); ctx.fill();
      }
      // 内耳
      ctx.fillStyle = '#a8dd94';
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sx * r * 0.58, -r * 0.82, r * 0.15, 0, Math.PI * 2); ctx.fill();
      }
      // 头
      ctx.fillStyle = '#6fc25a';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      // 腮红
      ctx.fillStyle = 'rgba(232,120,120,.35)';
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(sx * r * 0.62, r * 0.16, r * 0.2, r * 0.14, 0, 0, Math.PI * 2); ctx.fill();
      }
      // 眼睛
      ctx.fillStyle = '#1d2b1a';
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sx * r * 0.34, -r * 0.16, r * 0.135, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sx * r * 0.34 + r * 0.05, -r * 0.21, r * 0.045, 0, Math.PI * 2); ctx.fill();
      }
      // 鼻子
      ctx.fillStyle = '#8fd07a';
      ctx.beginPath(); ctx.ellipse(0, r * 0.3, r * 0.31, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4d7a44';
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sx * r * 0.11, r * 0.3, r * 0.062, 0, Math.PI * 2); ctx.fill();
      }

    } else if (def.wheel) {
      /* ---------- 轮子：外胎 + 辐条 ---------- */
      const isIron = part === 'iron_wheel';
      ctx.fillStyle = '#1c2229';
      ctx.beginPath(); ctx.arc(0, 0, h, 0, Math.PI * 2); ctx.fill();
      // 轮圈
      ctx.fillStyle = isIron ? '#6b7683' : '#a8763e';
      ctx.beginPath(); ctx.arc(0, 0, h * 0.84, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = isIron ? '#8a95a2' : '#c08a4a';
      ctx.beginPath(); ctx.arc(0, 0, h * 0.72, 0, Math.PI * 2); ctx.fill();
      // 辐条
      ctx.strokeStyle = isIron ? '#4e5862' : '#7d5227';
      ctx.lineWidth = Math.max(1.2, size * 0.055);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * h * 0.2, Math.sin(a) * h * 0.2);
        ctx.lineTo(Math.cos(a) * h * 0.7, Math.sin(a) * h * 0.7);
        ctx.stroke();
      }
      // 轮毂
      ctx.fillStyle = isIron ? '#c8d2dc' : '#e0b070';
      ctx.beginPath(); ctx.arc(0, 0, h * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = isIron ? '#6b7683' : '#a8763e';
      ctx.beginPath(); ctx.arc(0, 0, h * 0.12, 0, Math.PI * 2); ctx.fill();
      // 高光弧
      ctx.strokeStyle = 'rgba(255,255,255,.32)';
      ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.beginPath(); ctx.arc(0, 0, h * 0.6, -2.5, -0.9); ctx.stroke();

    } else if (def.energy) {
      /* ---------- 电池：电量条 ---------- */
      const pct = (def.__pct !== undefined) ? def.__pct : 1;
      ctx.fillStyle = '#4d7a2e';
      roundRect(-h * 0.56, -h * 0.76, size * 0.56, size * 0.78, 4); ctx.fill();
      ctx.fillStyle = '#e8f5c8';
      roundRect(-h * 0.48, -h * 0.68, size * 0.40, size * 0.62, 3); ctx.fill();
      // 电量
      const bh = size * 0.62 * Math.max(0, Math.min(1, pct));
      ctx.fillStyle = pct > 0.5 ? '#63d97e' : (pct > 0.2 ? '#ffd93d' : '#e0513c');
      ctx.fillRect(-h * 0.48, -h * 0.68 + (size * 0.62 - bh), size * 0.40, bh);
      // 正极
      ctx.fillStyle = '#9fb2c2';
      ctx.fillRect(-h * 0.2, -h * 0.86, size * 0.2, size * 0.1);
      // 闪电
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.moveTo(-h * 0.02, -h * 0.5); ctx.lineTo(h * 0.22, -h * 0.1);
      ctx.lineTo(0, -h * 0.1); ctx.lineTo(h * 0.12, h * 0.3);
      ctx.lineTo(-h * 0.24, -h * 0.04); ctx.lineTo(-h * 0.02, -h * 0.04);
      ctx.closePath(); ctx.fill();

    } else if (def.motor) {
      /* ---------- 马达：机身 + 散热槽 + 出轴 ---------- */
      ctx.fillStyle = '#e06a4a';
      roundRect(-h * 0.72, -h * 0.48, size * 0.72, size * 0.52, 4); ctx.fill();
      ctx.fillStyle = '#b44a30';
      roundRect(-h * 0.72, h * 0.0, size * 0.72, size * 0.1, 2); ctx.fill();
      // 散热槽
      ctx.strokeStyle = 'rgba(60,20,12,.55)'; ctx.lineWidth = Math.max(1, size * 0.035);
      for (let k = 0; k < 3; k++) {
        const xx = -h * 0.55 + k * size * 0.16;
        ctx.beginPath(); ctx.moveTo(xx, -h * 0.36); ctx.lineTo(xx, -h * 0.08); ctx.stroke();
      }
      // 出轴
      ctx.fillStyle = '#5a6672';
      ctx.fillRect(h * 0.0, -h * 0.16, size * 0.2, size * 0.16);
      ctx.fillStyle = '#c8d2dc';
      ctx.beginPath(); ctx.arc(h * 0.22, -h * 0.08, size * 0.09, 0, Math.PI * 2); ctx.fill();
      // 描边
      ctx.strokeStyle = '#8d3b28'; ctx.lineWidth = 2;
      roundRect(-h * 0.72, -h * 0.48, size * 0.72, size * 0.52, 4); ctx.stroke();

    } else if (def.interactive) {
      /* ---------- 打气筒：筒身 + 活塞 + 压力表 + 出气管 ---------- */
      ctx.fillStyle = '#2f5e78';
      roundRect(-h * 0.34, -h * 0.46, size * 0.34, size * 0.6, 5); ctx.fill();
      // 筒身高光
      ctx.fillStyle = 'rgba(190,235,255,.5)';
      roundRect(-h * 0.28, -h * 0.4, size * 0.09, size * 0.48, 3); ctx.fill();
      // 活塞头
      ctx.fillStyle = def.color;
      roundRect(-h * 0.42, -h * 0.7, size * 0.5, size * 0.2, 5); ctx.fill();
      ctx.strokeStyle = '#1d3a4a'; ctx.lineWidth = Math.max(1.4, size * 0.045);
      roundRect(-h * 0.42, -h * 0.7, size * 0.5, size * 0.2, 5); ctx.stroke();
      // 压力表
      ctx.fillStyle = '#e8f4ff';
      ctx.beginPath(); ctx.arc(-h * 0.02, h * 0.18, size * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1d3a4a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-h * 0.02, h * 0.18); ctx.lineTo(-h * 0.02 + size * 0.06, h * 0.18 - size * 0.05); ctx.stroke();
      // 出气管
      ctx.fillStyle = '#8fb8cc';
      ctx.fillRect(-h * 0.02, h * 0.02, size * 0.36, size * 0.14);
      ctx.fillStyle = '#e8f4ff';
      ctx.beginPath(); ctx.arc(h * 0.36, h * 0.09, size * 0.085, 0, Math.PI * 2); ctx.fill();

    } else {
      ctx.fillStyle = def.color; roundRect(-h * 0.8, -h * 0.8, size * 0.8, size * 0.8, 3); ctx.fill();
    }
    ctx.restore();
  }

'''
t = t[:start] + new_fn + t[end:]
p.write_text(t, encoding="utf-8")
print("零件视觉重做完成")

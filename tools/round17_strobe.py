"""修轮子频闪（strobing）。

问题：轮子 6 根辐条、360/6 = 60° 一个周期。12 m/s 时每帧转 5.9°，
60 帧后累计 354°，几乎正好绕一圈 → 辐条位置几乎重合 → **看起来轮子是静止的**。

修法（三选一，取最简单的）：
1. 辐条数改成 5（360/5 = 72°，5.9° 不会对齐）
2. 降低视觉转速（不真实）
3. 转速真实但辐条带非对称装饰（打破周期性）

选 1 + 3：5 根辐条 + 一个"偏心配重块"（位置随机不对称）。
这样即使转向接近周期，配重块的位置也能看出在转。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

old = """      // 辐条
      ctx.strokeStyle = isIron ? '#4e5862' : '#7d5227';
      ctx.lineWidth = Math.max(1.2, size * 0.055);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * h * 0.2, Math.sin(a) * h * 0.2);
        ctx.lineTo(Math.cos(a) * h * 0.7, Math.sin(a) * h * 0.7);
        ctx.stroke();
      }"""
new = """      // 辐条：5 根（360/5=72°，避免与轮速形成 60° 周期频闪）
      ctx.strokeStyle = isIron ? '#4e5862' : '#7d5227';
      ctx.lineWidth = Math.max(1.2, size * 0.055);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * h * 0.2, Math.sin(a) * h * 0.2);
        ctx.lineTo(Math.cos(a) * h * 0.7, Math.sin(a) * h * 0.7);
        ctx.stroke();
      }
      // 偏心配重块：打破旋转对称，高速时也能看出在转
      ctx.fillStyle = isIron ? '#3f4852' : '#6b451f';
      ctx.beginPath();
      ctx.arc(h * 0.42, -h * 0.16, Math.max(1.6, size * 0.075), 0, Math.PI * 2);
      ctx.fill();
      // 单侧亮片：进一步强化"转起来"的视觉线索
      ctx.fillStyle = isIron ? 'rgba(220,232,244,.75)' : 'rgba(255,226,180,.8)';
      ctx.beginPath();
      ctx.arc(-h * 0.44, h * 0.3, Math.max(1.2, size * 0.055), 0, Math.PI * 2);
      ctx.fill();"""
assert old in t, "spoke block not found"
t = t.replace(old, new)
p.write_text(t, encoding="utf-8")
print("轮子频闪修复完成")

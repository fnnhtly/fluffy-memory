"""用行号定位插入小碎石（放在草叶之前）。"""
import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

p = pathlib.Path("prototype/index.html")
lines = p.read_text(encoding="utf-8").split("\n")

# 找 grass3 band 那一行
target = None
for i, line in enumerate(lines):
    if "band(PAL.grass3" in line:
        target = i
        break
assert target is not None, "grass3 band not found"
print("grass3 band at line", target + 1)

if any("小碎石" in ln for ln in lines):
    print("已存在，跳过")
else:
    block = """    // 石头表面的小碎石（散落 + 高光）
    {
      const yTop = toY(cam.y) + 30;
      const n2 = Math.ceil((VIEW_W + VIEW_OFF_X * 2) / 46);
      for (let row = 0; row < 9; row++) {
        for (let c2 = 0; c2 < n2; c2++) {
          const h1 = Math.abs(Math.sin((c2 * 12.9898 + row * 78.233) * 43758.5453)) % 1;
          const h2 = Math.abs(Math.sin((c2 * 39.346 + row * 11.135) * 24634.6345)) % 1;
          if (h1 > 0.42) continue;
          const px = c2 * 46 + h1 * 40 - VIEW_OFF_X;
          const py = yTop + row * 62 + h2 * 46;
          if (py > DH + VIEW_OFF_Y) continue;
          const r2 = 3 + h2 * 5;
          ctx.beginPath();
          ctx.ellipse(px, py, r2 * 1.25, r2 * 0.8, h1 * 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(180,196,206,.30)'; ctx.fill();
          ctx.beginPath();
          ctx.ellipse(px - r2 * 0.25, py - r2 * 0.22, r2 * 0.55, r2 * 0.34, h1 * 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill();
        }
      }
    }""".split("\n")
    # 插在 grass3 之后（草叶之前）
    lines[target + 1:target + 1] = block
    p.write_text("\n".join(lines), encoding="utf-8")
    print("已插入小碎石，行数", len(block))

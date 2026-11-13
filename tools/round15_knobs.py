"""左侧三钮：标签从"下方"改到"右侧"（横向排列），彻底不再被圆钮压住。

竖排三个圆钮 + 下方标签，在 56px 的钮高下一定会挤。改成：
  圆钮在左，标签在右，一行一个 → 空间充足、永远不重叠。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# knob 内部：底板改成"横向胶囊"，标签画在右侧
rep("""      const knob = (rect, drawIcon, label, active) => {
        const c = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
        // 底板：避免文字被地形吞掉
        ctx.fillStyle = 'rgba(10,18,24,.5)';
        roundRect(rect.x - 10, rect.y - 7, rect.w + 20, rect.h + 34, 12); ctx.fill();
        ctx.fillStyle = active ? 'rgba(74,123,168,.95)' : 'rgba(24,34,42,.82)';
        ctx.beginPath(); ctx.arc(c.x, c.y, rect.w / 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = active ? 'rgba(255,255,255,.5)' : 'rgba(150,170,185,.35)';
        ctx.lineWidth = 2; ctx.stroke();
        drawIcon(c);
        text(label, c.x, rect.y + rect.h + 20, 12, active ? '#f0f8ff' : '#d4e2ee', 'center', true);
      };""",
"""      const knob = (rect, drawIcon, label, active) => {
        const c = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
        // 底板：横向胶囊（圆钮在左、文字在右，永不重叠）
        const labW = 62;
        ctx.fillStyle = 'rgba(10,18,24,.62)';
        roundRect(rect.x - 6, rect.y - 6, rect.w + labW + 16, rect.h + 12, (rect.h + 12) / 2); ctx.fill();
        ctx.fillStyle = active ? 'rgba(74,123,168,.95)' : 'rgba(24,34,42,.9)';
        ctx.beginPath(); ctx.arc(c.x, c.y, rect.w / 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = active ? 'rgba(255,255,255,.55)' : 'rgba(150,170,185,.4)';
        ctx.lineWidth = 2; ctx.stroke();
        drawIcon(c);
        text(label, rect.x + rect.w + 8, c.y + 5, 12.5, active ? '#f0f8ff' : '#d4e2ee', 'left', true);
      };""", "标签改到右侧")

p.write_text(t, encoding="utf-8")
print("done")

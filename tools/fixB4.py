"""第三part：替换暂停/重来图标绘制（按实际缩进），加暂停遮罩、帮助按钮、帮助面板挂载、H 键。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


old_icons = """    // 左上：暂停 / 重开（和参考一致的位置）
    ctx.fillStyle = '#e0513c';
    ctx.beginPath(); ctx.arc(48, 108, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(41, 97, 5, 22); ctx.fillRect(50, 97, 5, 22);
    ctx.fillStyle = '#63bf3f';
    ctx.beginPath(); ctx.arc(48, 160, 22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(48, 160, 12, -0.6, 3.6); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(60, 152); ctx.lineTo(61, 162); ctx.lineTo(51, 160); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill();"""

new_icons = """    // 左上：暂停 / 重来（可点击）；右上：帮助
    if (state.phase === 'run') {
      const PB = btnRect('pause'), RB = btnRect('restartRun');
      const pc = { x: PB.x + PB.w / 2, y: PB.y + PB.h / 2 };
      ctx.fillStyle = state.paused ? '#63bf3f' : '#e0513c';
      ctx.beginPath(); ctx.arc(pc.x, pc.y, PB.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff';
      if (state.paused) {
        ctx.beginPath();
        ctx.moveTo(pc.x - 6, pc.y - 10); ctx.lineTo(pc.x + 10, pc.y);
        ctx.lineTo(pc.x - 6, pc.y + 10); ctx.closePath(); ctx.fill();
      } else {
        ctx.fillRect(pc.x - 7, pc.y - 10, 5, 20);
        ctx.fillRect(pc.x + 2, pc.y - 10, 5, 20);
      }
      const rc = { x: RB.x + RB.w / 2, y: RB.y + RB.h / 2 };
      ctx.fillStyle = '#63bf3f';
      ctx.beginPath(); ctx.arc(rc.x, rc.y, RB.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(rc.x, rc.y, 10, -0.6, 3.6); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rc.x + 10, rc.y - 8); ctx.lineTo(rc.x + 11, rc.y + 2);
      ctx.lineTo(rc.x + 1, rc.y); ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.fill();
      const HB = btnRect('help');
      const hcx = HB.x + HB.w / 2, hcy = HB.y + HB.h / 2;
      ctx.fillStyle = 'rgba(24,34,42,.88)';
      ctx.beginPath(); ctx.arc(hcx, hcy, HB.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(232,200,122,.7)'; ctx.lineWidth = 2; ctx.stroke();
      text('?', hcx, hcy + 8, 22, '#ffe9b0', 'center', true);
    }"""
rep(old_icons, new_icons, "暂停/重来/帮助 绘制")

# 暂停遮罩 + 帮助面板挂载
rep("    drawHelp();\n    drawToast();\n  }", "    drawToast();\n  }", "（占位）") if "    drawHelp();\n    drawToast();\n  }" in t else None
rep("    drawToast();\n  }", "    drawHelp();\n    drawToast();\n  }", "画帮助面板")

# H 键
rep("    if (k === 't') {", "    if (k === 'h') { state.helpOpen = !state.helpOpen; return; }\n    if (k === 't') {", "H 键")

# 建造界面帮助按钮绘制
rep("      }, '换方向 R', canRot);",
"""      }, '换方向 R', canRot);
      const HB2 = btnRect('help');
      ctx.fillStyle = state.helpOpen ? 'rgba(74,123,168,.95)' : 'rgba(24,34,42,.85)';
      roundRect(HB2.x, HB2.y, HB2.w, HB2.h, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(232,200,122,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      text('? 零件说明', HB2.x + HB2.w / 2, HB2.y + 28, 13, '#ffe9b0', 'center', true);""",
    "帮助按钮(build)绘制")

p.write_text(t, encoding="utf-8")
print("part3 written")

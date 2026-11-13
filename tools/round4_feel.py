"""第 4 轮 B：建造手感最后打磨
1) 零件落下弹性（scale 过冲 1.25 → 1.0）
2) 放置音效音高随槽位/高度变化（越往上越高）
3) 空格子悬停时若当前零件放不下，光标变红叉
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 音高随位置变化
rep("      place() { tone(520, 0.07, 'square', 0.07); },",
"""      place(h) {
        // 越往上音越高（h 建议传 0..1）
        const f = 440 + (h || 0) * 260;
        tone(f, 0.07, 'square', 0.07);
      },""", "place 支持音高")

rep("    if (res.ok) SFX.place(); else SFX.deny();",
"    if (res.ok) SFX.place(1 - r / RAP.BUILD_ROWS); else SFX.deny();", "放置音高")

# 2) 落下弹性：记录每个格子的落地时间
rep("    camState: { x: 0, y: 0, zoom: 1.7 }, shake: 0, flash: 0, vignette: 0, levelSelect: false,",
    "    camState: { x: 0, y: 0, zoom: 1.7 }, shake: 0, flash: 0, vignette: 0, levelSelect: false,\n"
    "    popped: {},        // 刚落下的格子 → 播放弹性", "popped 状态")

# tryPlaceAt 成功后记录
rep("    if (res.ok) SFX.place(1 - r / RAP.BUILD_ROWS); else SFX.deny();",
"""    if (res.ok) {
      SFX.place(1 - r / RAP.BUILD_ROWS);
      state.popped[r + ',' + c] = performance.now();   // 弹性动画起点
    } else SFX.deny();""", "记录弹性起点")

# 3) 绘制时按 elapsed 算 scale 过冲
rep("      drawPartShape(cell.part, p.x, p.y, BUILD_PX * 0.88, cell.dir, cell.part === 'wood_frame' ? 3 : undefined);",
"""      {
        // 落下弹性：1.22 → 1.0（180ms）
        let sc = 1;
        const t0 = state.popped[k];
        if (t0) {
          const age = (performance.now() - t0) / 180;
          if (age < 1) sc = 1 + 0.22 * Math.sin(Math.PI * age) * (1 - age * 0.4);
          else delete state.popped[k];
        }
        drawPartShape(cell.part, p.x, p.y, BUILD_PX * 0.88 * sc, cell.dir,
          cell.part === 'wood_frame' ? 3 : undefined);
      }""", "落下弹性")

# 4) 放不下的格子：红色叉
rep("""    const ghost = state.dragPart || (state.selected !== 'eraser' ? state.selected : null);""",
"""    // 当前选中零件放不下的格子 → 红叉提示
    if (cell && !state.build.cells[cell.r + ',' + cell.c] && state.selected !== 'eraser') {
      const probe = RAP.tryPlace(level(), state.build, state.selected, cell.r, cell.c);
      if (probe.ok && !probe.rotated) {
        const kk = cell.r + ',' + cell.c;
        if (state.build.cells[kk] && state.build.cells[kk].part === state.selected) {
          if (state.build.cells[kk].inner) state.build.cells[kk].inner = null;
          else delete state.build.cells[kk];
          const oi = state.build.order.lastIndexOf('inner:' + kk);
          if (oi >= 0) state.build.order.splice(oi, 1);
          const oj = state.build.order.lastIndexOf(kk);
          if (oj >= 0) state.build.order.splice(oj, 1);
        }
      } else if (!probe.ok) {
        const cx0 = o.x + cell.c * BUILD_PX + BUILD_PX / 2;
        const cy0 = o.y + cell.r * BUILD_PX + BUILD_PX / 2;
        ctx.strokeStyle = 'rgba(224,81,60,.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        const s2 = BUILD_PX * 0.2;
        ctx.beginPath();
        ctx.moveTo(cx0 - s2, cy0 - s2); ctx.lineTo(cx0 + s2, cy0 + s2);
        ctx.moveTo(cx0 + s2, cy0 - s2); ctx.lineTo(cx0 - s2, cy0 + s2);
        ctx.stroke();
      }
    }

    const ghost = state.dragPart || (state.selected !== 'eraser' ? state.selected : null);""",
    "放不下红叉")

p.write_text(t, encoding="utf-8")
print("建造手感完成")

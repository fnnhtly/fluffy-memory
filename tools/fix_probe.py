"""根治：把"探测能否放置"从 tryPlace 里拆出来，改成无副作用的 canPlace。

问题：
- `tryPlace` 对已放置的方向件会真的执行 `dir = (dir+1)%4`
- 而渲染层（吸附高亮 / 悬停红叉预览）每帧都调 `tryPlace` 做探测
- → 鼠标悬停在打气筒上时，每帧转一次，按住就"一直旋转"

修法：
1. game.js 新增纯函数 `canPlace(level, build, part, r, c)`（只返回 ok/reason/rotated，不改数据）
2. 渲染层两处探测改用它
3. `tryPlace` 拆成 `canPlace` + `applyPlace`，行为不变
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")

# ---------- 1) 读现有 tryPlace，改成 canPlace + applyPlace ----------
start = s.find("  // 返回 { ok, reason }")
if start < 0:
    start = s.find("  function tryPlace(level, build, part, r, c) {")
    start = s.rfind("\n", 0, s.rfind("\n", 0, start)) + 1
end = s.find("  function removeAt(build, r, c) {")
assert start > 0 and end > start, "tryPlace block not found"
old_block = s[start:end]
print("--- 原 tryPlace 块长度:", len(old_block))

new_block = '''  // 只检查、不改数据（渲染层探测专用，避免"每帧推进状态"的 bug）
  // 返回 { ok, reason, rotated, dir }
  function canPlace(level, build, part, r, c) {
    if (r < 0 || r >= BUILD_ROWS || c < 0 || c >= BUILD_COLS) return { ok: false, reason: 'outside' };
    var key = r + ',' + c;
    if (!PARTS[part]) return { ok: false, reason: 'unknown' };

    // 内嵌件（小猪/电池）：必须放进一个已经摆好的木框里
    if (isInnerPart(part)) {
      var host = build.cells[key];
      if (!host || !PARTS[host.part].structure) return { ok: false, reason: 'need_frame' };
      if (host.inner) return { ok: false, reason: 'occupied' };
      if (budgetLeft(level, part, build) <= 0) return { ok: false, reason: 'budget' };
      return { ok: true, reason: '' };
    }

    if (budgetLeft(level, part, build) <= 0) return { ok: false, reason: 'budget' };

    var there = build.cells[key];
    if (there) {
      // 已放的同类方向件 → 可旋转
      if (there.part === part && isDirectional(part)) {
        return { ok: true, reason: '', rotated: true, dir: ((there.dir || 0) + 1) % 4 };
      }
      return { ok: false, reason: 'occupied' };
    }
    if (isInteractive(part) && interactiveCount(build) >= Params.interactCap) {
      return { ok: false, reason: 'interact_limit' };
    }
    // 必须贴着已有结构件
    var touching = false;
    var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (var i = 0; i < dirs.length; i++) {
      var k2 = (r + dirs[i][0]) + ',' + (c + dirs[i][1]);
      var nb = build.cells[k2];
      if (nb && PARTS[nb.part].structure) { touching = true; break; }
    }
    if (!touching) return { ok: false, reason: 'connect' };
    return { ok: true, reason: '' };
  }

  // 真正落地：先 canPlace，再写数据
  function tryPlace(level, build, part, r, c) {
    var chk = canPlace(level, build, part, r, c);
    if (!chk.ok) return chk;
    var key = r + ',' + c;

    if (isInnerPart(part)) {
      build.cells[key].inner = part;
      build.order.push('inner:' + key);
      return { ok: true, reason: '' };
    }
    if (chk.rotated) {
      build.cells[key].dir = chk.dir;
      return { ok: true, reason: '', rotated: true, dir: chk.dir };
    }
    build.cells[key] = { part: part, dir: 0 };
    build.order.push(key);
    return { ok: true, reason: '' };
  }

'''
s = s[:start] + new_block + s[end:]

# ---------- 2) 导出 canPlace ----------
s = s.replace("    newBuild: newBuild, tryPlace: tryPlace, removeAt: removeAt, undo: undo,",
              "    newBuild: newBuild, tryPlace: tryPlace, canPlace: canPlace, removeAt: removeAt, undo: undo,")

g.write_text(s, encoding="utf-8")
print("game.js: canPlace 拆分完成")

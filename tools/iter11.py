"""两处修正：
1) 框里的猪受框保护：受伤阈值保持 8（不再因为"框碎了变 5"而连锁受伤）
2) 内嵌件的"格子已占用"检查放在预算之前，提示更准确
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")

# 1) 受伤阈值
s = s.replace("""    var pigExposed = state.car.parts.some(function (p) { return p.def.pig && p.exposed; });
    if (vn > (pigExposed ? 5 : 8)) {""",
"""    // 木框在的时候猪是受保护的；框碎了猪暴露，但阈值不降（避免一次落地就三连伤）
    if (vn > 8) {""")

# 2) 内嵌件先判占用再判预算
s = s.replace("""    if (!PARTS[part]) return { ok: false, reason: 'unknown' };
    if (budgetLeft(level, part, build) <= 0) return { ok: false, reason: 'budget' };

    // 内嵌件（小猪）：必须放进一个已经摆好的木框里（同一格的内槽）
    if (isInnerPart(part)) {
      var host = build.cells[key];
      if (!host || !PARTS[host.part].structure) return { ok: false, reason: 'need_frame' };
      if (host.inner) return { ok: false, reason: 'occupied' };
      host.inner = part;
      build.order.push('inner:' + key);
      return { ok: true, reason: '' };
    }""",
"""    if (!PARTS[part]) return { ok: false, reason: 'unknown' };

    // 内嵌件（小猪）：必须放进一个已经摆好的木框里（同一格的内槽）
    if (isInnerPart(part)) {
      var host = build.cells[key];
      if (!host || !PARTS[host.part].structure) return { ok: false, reason: 'need_frame' };
      if (host.inner) return { ok: false, reason: 'occupied' };
      if (budgetLeft(level, part, build) <= 0) return { ok: false, reason: 'budget' };
      host.inner = part;
      build.order.push('inner:' + key);
      return { ok: true, reason: '' };
    }

    if (budgetLeft(level, part, build) <= 0) return { ok: false, reason: 'budget' };""")

g.write_text(s, encoding="utf-8")
print("game.js: 受伤阈值 + 占用判定顺序")

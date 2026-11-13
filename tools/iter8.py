"""木框中空 + 角色内嵌（一格里可以有一个外框 + 一个内嵌件）。

规则：
- 木框（structure）照旧占一格；
- 小猪是"内嵌件"：只能放进**已有木框**的格子里，占该格的 inner 槽；
- 内嵌件不参与挂载判定（它挂在框里），但计入质量/重心；
- 框碎掉时内嵌的小猪暴露 → 再挨一次冲击就受伤（甚至 pig_dead）。
"""
import pathlib

p = pathlib.Path("prototype/game.js")
t = p.read_text(encoding="utf-8")

# 1) 零件表加小猪（内嵌件）
t = t.replace("""    pump: { label: '打气筒', mass: 0.8, interactive: true, color: '#4f8fb0' }""",
"""    pump: { label: '打气筒', mass: 0.8, interactive: true, color: '#4f8fb0' },
    pig: { label: '小猪', mass: 1.5, hp: 3, pig: true, color: '#6fc25a' }""")
t = t.replace("  var TRAY_ORDER = ['wood_frame', 'wood_wheel', 'iron_wheel', 'motor', 'battery', 'pump'];",
              "  var TRAY_ORDER = ['wood_frame', 'wood_wheel', 'iron_wheel', 'motor', 'battery', 'pump', 'pig'];")

# 2) 内嵌件判定
t = t.replace("  function isInteractive(part) { return !!(PARTS[part] && PARTS[part].interactive); }",
"""  function isInteractive(part) { return !!(PARTS[part] && PARTS[part].interactive); }
  function isInnerPart(part) { return !!(PARTS[part] && PARTS[part].pig); }   // 只能放进中空木框""")

# 3) 预算统计要算上 inner
t = t.replace("""  function budgetLeft(level, part, build) {
    var box = level.partsBox || {};
    var total = box[part] || 0;
    var used = 0;
    Object.keys(build.cells).forEach(function (k) {
      if (build.cells[k].part === part) used++;
    });
    return total - used;
  }""",
"""  function budgetLeft(level, part, build) {
    var box = level.partsBox || {};
    var total = box[part] || 0;
    var used = 0;
    Object.keys(build.cells).forEach(function (k) {
      var cell = build.cells[k];
      if (cell.part === part) used++;
      if (cell.inner === part) used++;
    });
    return total - used;
  }""")

# 4) tryPlace：支持放进中空木框
t = t.replace("""  // 返回 { ok, reason }
  function tryPlace(level, build, part, r, c) {
    if (r < 0 || r >= BUILD_ROWS || c < 0 || c >= BUILD_COLS) return { ok: false, reason: 'outside' };
    var key = r + ',' + c;
    if (build.cells[key]) return { ok: false, reason: 'occupied' };
    if (!PARTS[part]) return { ok: false, reason: 'unknown' };
    if (budgetLeft(level, part, build) <= 0) return { ok: false, reason: 'budget' };
    if (isInteractive(part) && interactiveCount(build) >= Params.interactCap) {
      return { ok: false, reason: 'interact_limit' };
    }""",
"""  // 返回 { ok, reason }
  function tryPlace(level, build, part, r, c) {
    if (r < 0 || r >= BUILD_ROWS || c < 0 || c >= BUILD_COLS) return { ok: false, reason: 'outside' };
    var key = r + ',' + c;
    if (!PARTS[part]) return { ok: false, reason: 'unknown' };
    if (budgetLeft(level, part, build) <= 0) return { ok: false, reason: 'budget' };

    // 内嵌件（小猪）：必须放进一个已经摆好的木框里（同一格的内槽）
    if (isInnerPart(part)) {
      var host = build.cells[key];
      if (!host || !PARTS[host.part].structure) return { ok: false, reason: 'need_frame' };
      if (host.inner) return { ok: false, reason: 'occupied' };
      host.inner = part;
      build.order.push('inner:' + key);
      return { ok: true, reason: '' };
    }

    if (build.cells[key]) return { ok: false, reason: 'occupied' };
    if (isInteractive(part) && interactiveCount(build) >= Params.interactCap) {
      return { ok: false, reason: 'interact_limit' };
    }""")

# 5) 移除 / 撤销要处理 inner
t = t.replace("""  function removeAt(build, r, c) {
    var key = r + ',' + c;
    if (!build.cells[key]) return false;
    delete build.cells[key];
    var i = build.order.indexOf(key);
    if (i >= 0) build.order.splice(i, 1);
    return true;
  }""",
"""  function removeAt(build, r, c) {
    var key = r + ',' + c;
    var cell = build.cells[key];
    if (!cell) return false;
    // 先摘内嵌件，再拆框（和参考里"先拿猪再拆框"一致）
    if (cell.inner) {
      cell.inner = null;
      var ii = build.order.indexOf('inner:' + key);
      if (ii >= 0) build.order.splice(ii, 1);
      return true;
    }
    delete build.cells[key];
    var i = build.order.indexOf(key);
    if (i >= 0) build.order.splice(i, 1);
    return true;
  }""")

t = t.replace("""  function undo(build) {
    var key = build.order.pop();
    if (!key) return false;
    delete build.cells[key];
    return true;
  }""",
"""  function undo(build) {
    var key = build.order.pop();
    if (!key) return false;
    if (key.indexOf('inner:') === 0) {
      var ck = key.slice(6);
      if (build.cells[ck]) build.cells[ck].inner = null;
      return true;
    }
    delete build.cells[key];
    return true;
  }""")

# 6) buildVehicle 把 inner 一起算进车体
t = t.replace("""    Object.keys(build.cells).forEach(function (k) {
      var cell = build.cells[k];
      var rr = parseInt(k.split(',')[0], 10);
      var cc = parseInt(k.split(',')[1], 10);
      var def = PARTS[cell.part];
      var p = partPos(rr, cc);
      parts.push({ part: cell.part, def: def, r: rr, c: cc, lx: p.x, ly: p.y, dir: cell.dir, hp: def.hp || 1 });
      mass += def.mass;
      if (def.energy) energy += def.energy;
      if (def.interactive) interactives.push(cell.part);
    });""",
"""    var hasPig = false;
    Object.keys(build.cells).forEach(function (k) {
      var cell = build.cells[k];
      var rr = parseInt(k.split(',')[0], 10);
      var cc = parseInt(k.split(',')[1], 10);
      var def = PARTS[cell.part];
      var p = partPos(rr, cc);
      parts.push({ part: cell.part, def: def, r: rr, c: cc, lx: p.x, ly: p.y, dir: cell.dir, hp: def.hp || 1 });
      mass += def.mass;
      if (def.energy) energy += def.energy;
      if (def.interactive) interactives.push(cell.part);
      if (cell.inner) {
        var idf = PARTS[cell.inner];
        parts.push({ part: cell.inner, def: idf, r: rr, c: cc, lx: p.x, ly: p.y, dir: 0,
                     hp: idf.hp || 1, inner: true, host: k });
        mass += idf.mass;
        if (idf.pig) hasPig = true;
      }
    });""")
t = t.replace("      energyMax: energy + (motor ? MOTOR_BASE_ENERGY : 0),",
              "      hasPig: hasPig,\n      energyMax: energy + (motor ? MOTOR_BASE_ENERGY : 0),")

# 7) 框碎了 → 猪暴露；再有冲击就受伤
t = t.replace("""      // 方案 B：碎块只做特效，不参与物理；但质量/重心要更新
      state.car.parts = state.car.parts.filter(function (p) { return broken.indexOf(p) < 0; });""",
"""      // 方案 B：碎块只做特效，不参与物理；但质量/重心要更新
      var brokenKeys = broken.map(function (p) { return p.r + ',' + p.c; });
      state.car.parts.forEach(function (p) {
        if (p.inner && brokenKeys.indexOf(p.host) >= 0) p.exposed = true;
      });
      state.car.parts = state.car.parts.filter(function (p) { return broken.indexOf(p) < 0; });""")
t = t.replace("""    if (vn > 8) {
      state.pigHP -= 1;""",
"""    var pigExposed = state.car.parts.some(function (p) { return p.def.pig && p.exposed; });
    if (vn > (pigExposed ? 5 : 8)) {
      state.pigHP -= 1;""")

p.write_text(t, encoding="utf-8")
print("game.js: 木框中空 + 内嵌小猪")

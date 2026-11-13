"""第一轮修复（规则层 game.js）—— 按实际文件内容精确匹配。"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")
applied = []


def rep(a, b, why):
    global s
    assert a in s, "NOT FOUND: " + why
    s = s.replace(a, b)
    applied.append(why)


# 1) 零件表
rep("    wood_frame: { label: '木框', mass: 1.2, hp: 2, structure: true, color: '#c08a4a', dark: '#8a5f30' },",
    "    wood_frame: { label: '木框', mass: 1.2, hp: 3, maxHp: 3, structure: true, color: '#c08a4a', dark: '#8a5f30' },",
    "木框 3 段耐久")
rep("    battery: { label: '电池', mass: 1.0, energy: 100, color: '#8fd66a' },",
    "    battery: { label: '电池', mass: 1.0, energy: 100, inner: true, color: '#8fd66a' },",
    "电池改内嵌件")
rep("    pig: { label: '小猪', mass: 1.5, hp: 3, pig: true, color: '#6fc25a' }",
    "    pig: { label: '小猪', mass: 1.5, hp: 3, pig: true, inner: true, color: '#6fc25a' }",
    "小猪标记 inner")
rep("  function isInnerPart(part) { return !!(PARTS[part] && PARTS[part].pig); }   // 只能放进中空木框",
    "  function isInnerPart(part) { return !!(PARTS[part] && PARTS[part].inner); }   // 只能放进中空木框",
    "inner 判定通用化")

# 2) 分组
rep("    var hasPig = false;", "    var hasPig = false;\n    var groups = [];        // 同种（同色）可启动零件 = 一个组", "groups 初始化")
rep("      if (def.interactive) interactives.push(cell.part);",
"""      if (def.interactive) {
        interactives.push(cell.part);
        var g0 = groups.filter(function (g) { return g.part === cell.part; })[0];
        if (!g0) { g0 = { part: cell.part, color: def.color, list: [], on: false }; groups.push(g0); }
        g0.list.push(parts[parts.length - 1]);
      }""", "分组收集")
rep("      hasPig: hasPig,", "      hasPig: hasPig,\n      groups: groups,", "车体带 groups")

# 3) 出生：贴地 + 保护期
rep("    startY = terrain.surfaceY(startX) - lowest + 0.06;",
    "    startY = terrain.surfaceY(startX) - lowest + 0.01;   // 刚好贴地，不再从空中掉下来", "出生贴地")
rep("    state.stuckTimer = 0;\n    return state;",
    "    state.stuckTimer = 0;\n    state.spawnGrace = 0.6;    // 出生保护期：不算结构伤害\n    state.loose = [];          // 框碎后掉出来的东西\n    return state;", "保护期 + 掉落容器")

# 4) damageCar 重写 + stepLoose
old = s[s.find("  function damageCar(state, vn) {"):s.find("  function resolve(state, reason) {")]
new = '''  function damageCar(state, vn) {
    if (state.time < (state.spawnGrace || 0)) return;      // 出生落地不算摔
    if (vn < 6) return;
    var dmg = vn > 12 ? 2 : 1;
    var broken = [];
    state.car.parts.forEach(function (p) {
      if (!p.def.structure) return;
      p.hp -= dmg;
      if (p.hp <= 0) broken.push(p);
    });
    if (broken.length) {
      broken.forEach(function (p) {
        log(state, 'part_broken part=' + p.part + ' at=' + p.r + ',' + p.c);
      });
      var brokenKeys = broken.map(function (p) { return p.r + ',' + p.c; });
      // 框碎了 → 框里的东西真的掉出来（自由体：会落地、会滚）
      state.car.parts.forEach(function (p) {
        if (!p.inner) return;
        if (brokenKeys.indexOf(p.host) < 0) return;
        var wp = worldOf(state.car, p.lx, p.ly);
        state.loose.push({
          part: p.part, x: wp.x, y: wp.y,
          vx: state.car.vx * 0.6 + (Math.random() - 0.5) * 1.2,
          vy: state.car.vy * 0.4 + 1.0,
          a: 0, w: (Math.random() - 0.5) * 4, r: 0.34, rest: 0
        });
        log(state, 'part_loose part=' + p.part);
        if (p.def.pig) { state.car.hasPig = false; state.pigLooseAt = state.time; }
      });
      state.car.parts = state.car.parts.filter(function (p) {
        return broken.indexOf(p) < 0 && !(p.inner && brokenKeys.indexOf(p.host) >= 0);
      });
      var m = 0;
      state.car.parts.forEach(function (p) { m += p.def.mass; });
      state.car.mass = m > 0 ? m : 0.01;
      state.car.inv = 1 / state.car.mass;
      state.car.wheels = state.car.parts.filter(function (p) { return p.def.wheel; });
    }
    var now = state.time;
    if (vn > 10 && now - (state.lastPigHurt || -9) > 0.6) {
      state.lastPigHurt = now;
      state.pigHP -= 1;
      log(state, 'pig_hurt hp=' + state.pigHP);
      if (state.pigHP <= 0) resolve(state, 'pig_dead');
    }
  }

  // 自由体（掉出来的小猪/电池）：重力 + 落地弹跳 + 滚动
  function stepLoose(state, dt) {
    var ter = state.terrain, G = Params.gravity;
    for (var i = 0; i < state.loose.length; i++) {
      var L = state.loose[i];
      L.vy -= G * dt;
      L.x += L.vx * dt;
      L.y += L.vy * dt;
      L.a += L.w * dt;
      var gy = ter.surfaceY(L.x) + L.r;
      if (L.y < gy) {
        L.y = gy;
        if (L.vy < 0) L.vy = -L.vy * 0.28;
        L.vx *= 0.86;
        L.w *= 0.8;
        if (Math.abs(L.vy) < 0.6) L.vy = 0;
      }
      var sp = Math.hypot(L.vx, L.vy);
      if (sp < 0.35) { L.rest += dt; L.vx *= 0.9; L.w *= 0.9; } else L.rest = 0;
    }
    var pigLoose = state.loose.filter(function (L) { return PARTS[L.part].pig; })[0];
    if (pigLoose && pigLoose.rest > 0.5) resolve(state, 'pig_lost');
  }

'''
s = s.replace(old, new)
applied.append("damageCar 重写 + stepLoose")

# 5) 交互按组
rep("""  function pressInteract(state, n) {
    if (state.phase !== 'run') return false;
    var car = state.car;
    var list = car.interactives;
    var part = list[n - 1];
    if (!part) return false;
    log(state, 'interact_key n=' + n + ' part=' + part);""",
"""  // n = 第几个"颜色组"（同色同类零件一起响应）
  function pressInteract(state, n) {
    if (state.phase !== 'run') return false;
    var car = state.car;
    var grp = (car.groups || [])[n - 1];
    if (!grp) return false;
    log(state, 'interact_key n=' + n + ' part=' + grp.part + ' count=' + grp.list.length);
    grp.on = true;""", "press 按组")

old_rel = s[s.find("  function releaseInteract(state, n) {"):s.find("  // ---------------- 物理步进 ----------------")]
new_rel = '''  function releaseInteract(state, n) {
    if (state.phase !== 'run') return false;
    var car = state.car;
    var grp = (car.groups || [])[n - 1];
    if (!grp) return false;
    var c = Math.max(0, Math.min(1, car.pumpCharge / 0.8));
    var dv = Params.pumpImpulse * (0.35 + 0.65 * c);
    var ca = Math.cos(car.a), sa = Math.sin(car.a);
    // 同组里每个零件都按自己的朝向推一次（装得多，推力就大）
    grp.list.forEach(function (p) {
      var v = dirVec(p.dir || 0);
      var wx = v[0] * ca - v[1] * sa;
      var wy = v[0] * sa + v[1] * ca;
      car.vx += dv * wx;
      car.vy += dv * wy;
      car.w += 0.8 * (0.4 + 0.6 * c) * (v[0] >= 0 ? 1 : -1);
    });
    log(state, 'pump_release count=' + grp.list.length);
    grp.on = false;
    car.pumpCharge = 0;
    car.pumpHeld = false;
    return true;
  }

'''
s = s.replace(old_rel, new_rel)
applied.append("release 按组")

# 6) 吃箱子
rep("      if (Math.abs(car.x - bx) < 1.2 && Math.abs(car.y - by) < 1.5) {",
    "      if (Math.abs(car.x - bx) < 1.7 && Math.abs(car.y - by) < 1.7) {   // 放宽：车体碰到就算", "吃箱子放宽")
rep("    // 木箱\n    for (var bi = 0;",
    "    stepLoose(state, dt);\n\n    // 木箱\n    for (var bi = 0;", "每帧推进自由体")

# 7) 导出
rep("    createRun: createRun, step: step, pressInteract: pressInteract,",
    "    createRun: createRun, step: step, stepLoose: stepLoose, pressInteract: pressInteract,", "导出 stepLoose")

# 8) SPECS：电池改成内嵌（放进 4,3）
for a, b in [
    ("motor: [[3, 2]], battery: [[3, 3]], pig: [[4, 2]] }",
     "motor: [[3, 2]], battery: [[4, 3]], pig: [[4, 2]] }"),
]:
    s = s.replace(a, b)
applied.append("SPECS 电池进框")

g.write_text(s, encoding="utf-8")
print("applied:\n- " + "\n- ".join(applied))

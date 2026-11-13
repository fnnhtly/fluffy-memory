"""第一轮修复（规则层 game.js）：
1) 同色同类 = 同组：按颜色按钮 → 该颜色所有零件同时启动
2) 内嵌件扩展到电池（只能放框里），小猪/电池都走内槽
3) 木框耐久 3 段（3 完好 / 2 裂纹 / 1 破损 / 0 碎掉）
4) 出生贴地 + 0.6s 保护期（不再"掉下来把木结构摔没"）
5) 框碎了 → 小猪变成自由落体（真的掉下来、会滚、停住就 pig_lost）
6) 吃木箱改成"车体包围盒 vs 木箱"判定，不再要求车心精确对齐
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")


def rep(a, b, why):
    global s
    assert a in s, "NOT FOUND: " + why
    s = s.replace(a, b)
    print("  ok:", why)


# ---------- 1) 零件表 ----------
rep("    wood_frame: { label: '木框', mass: 1.2, structure: true, hp: 2, color: '#c08a4a' },",
    "    wood_frame: { label: '木框', mass: 1.2, structure: true, hp: 3, maxHp: 3, color: '#c08a4a' },",
    "木框 3 段耐久")
rep("    battery: { label: '电池', mass: 1.0, energy: 100, color: '#8fd66a' },",
    "    battery: { label: '电池', mass: 1.0, energy: 100, inner: true, color: '#8fd66a' },",
    "电池改成内嵌件")
rep("    pig: { label: '小猪', mass: 1.5, hp: 3, pig: true, color: '#6fc25a' }",
    "    pig: { label: '小猪', mass: 1.5, hp: 3, pig: true, inner: true, color: '#6fc25a' }",
    "小猪标记 inner")
rep("  function isInnerPart(part) { return !!(PARTS[part] && PARTS[part].pig); }   // 只能放进中空木框",
    "  function isInnerPart(part) { return !!(PARTS[part] && PARTS[part].inner); }   // 只能放进中空木框",
    "inner 判定通用化")

# ---------- 2) buildVehicle：分组 + 内嵌件通用 ----------
rep("""      if (cell.inner) {
        var idf = PARTS[cell.inner];
        parts.push({ part: cell.inner, def: idf, r: rr, c: cc, lx: p.x, ly: p.y, dir: 0,
                     hp: idf.hp || 1, inner: true, host: k });
        mass += idf.mass;
        if (idf.pig) hasPig = true;
      }""",
"""      if (cell.inner) {
        var idf = PARTS[cell.inner];
        parts.push({ part: cell.inner, def: idf, r: rr, c: cc, lx: p.x, ly: p.y, dir: 0,
                     hp: idf.hp || 1, inner: true, host: k });
        mass += idf.mass;
        if (idf.pig) hasPig = true;
      }""",
    "内嵌件照旧（电池也走这条）")

rep("""      energyMax: energy + (motor ? MOTOR_BASE_ENERGY : 0),""",
"""      groups: groups,
      energyMax: energy + (motor ? MOTOR_BASE_ENERGY : 0),""",
    "车体带 groups")

rep("""    var hasPig = false;""",
"""    var hasPig = false;
    var groups = [];        // 同种（同色）可启动零件 = 一个组""",
    "groups 初始化")

rep("""      if (def.interactive) interactives.push(cell.part);""",
"""      if (def.interactive) {
        interactives.push(cell.part);
        var g0 = groups.filter(function (g) { return g.part === cell.part; })[0];
        if (!g0) { g0 = { part: cell.part, color: def.color, list: [], on: false }; groups.push(g0); }
        g0.list.push(parts[parts.length - 1]);
      }""",
    "分组收集")

# ---------- 3) 出生：贴地 + 保护期 ----------
rep("    startY = terrain.surfaceY(startX) - lowest + 0.06;",
    "    startY = terrain.surfaceY(startX) - lowest + 0.01;   // 刚好贴地，不再从空中掉下来",
    "出生贴地")
rep("    state.stuckTimer = 0;\n    return state;",
    "    state.stuckTimer = 0;\n    state.spawnGrace = 0.6;    // 出生保护期：不计算结构伤害\n    state.loose = [];          // 框碎后掉出来的东西（小猪/电池）\n    return state;",
    "保护期 + 自由落体容器")

# ---------- 4) 伤害：分段 + 保护期 + 掉猪 ----------
old_damage = s[s.find("  function damageCar(state, vn) {"):s.find("  function resolve(state, reason) {")]
new_damage = '''  function damageCar(state, vn) {
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
      // 框碎了 → 框里的东西真的掉出来（变成自由体，会落地、会滚）
      state.car.parts.forEach(function (p) {
        if (!p.inner) return;
        if (brokenKeys.indexOf(p.host) < 0) return;
        var wp = worldOf(state.car, p.lx, p.ly);
        state.loose.push({
          part: p.part, x: wp.x, y: wp.y,
          vx: state.car.vx * 0.6 + (Math.random() - 0.5) * 1.2,
          vy: state.car.vy * 0.4 + 1.0,
          a: 0, w: (Math.random() - 0.5) * 4,
          r: 0.34, rest: 0
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
    // 猪只被"真摔"伤到（框在时更抗摔）
    var now = state.time;
    if (vn > 10 && now - (state.lastPigHurt || -9) > 0.6) {
      state.lastPigHurt = now;
      state.pigHP -= 1;
      log(state, 'pig_hurt hp=' + state.pigHP);
      if (state.pigHP <= 0) resolve(state, 'pig_dead');
    }
  }

  // 自由体（掉出来的小猪/电池）：重力 + 落地 + 滚动
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
        if (L.vy < 0) L.vy = -L.vy * 0.28;               // 弹一下
        L.vx *= 0.86;
        L.w *= 0.8;
        if (Math.abs(L.vy) < 0.6) L.vy = 0;
      }
      var sp = Math.hypot(L.vx, L.vy);
      if (sp < 0.35) {
        L.rest += dt;
        L.vx *= 0.9; L.w *= 0.9;
      } else L.rest = 0;
    }
    // 掉出来的小猪停住 = 掉队
    var pigLoose = state.loose.filter(function (L) { return PARTS[L.part].pig; })[0];
    if (pigLoose && pigLoose.rest > 0.5) resolve(state, 'pig_lost');
  }

'''
s = s.replace(old_damage, new_damage)
print("  ok: damageCar 重写 + stepLoose")

# ---------- 5) 交互：按组启动 ----------
rep("""  function pressInteract(state, n) {
    if (state.phase !== 'run') return false;
    var car = state.car;
    var list = car.interactives;
    var part = list[n - 1];
    if (!part) return false;
    log(state, 'interact_key n=' + n + ' part=' + part);
    car.pumpHeld = true;
    state.pumpPress++;
    log(state, 'pump_charge v=0.0');
    return true;
  }""",
"""  // n = 第几个"颜色组"（同色同类零件一起响应）
  function pressInteract(state, n) {
    if (state.phase !== 'run') return false;
    var car = state.car;
    var grp = (car.groups || [])[n - 1];
    if (!grp) return false;
    log(state, 'interact_key n=' + n + ' part=' + grp.part + ' count=' + grp.list.length);
    grp.on = true;
    car.pumpHeld = true;
    state.pumpPress++;
    log(state, 'pump_charge v=0.0');
    return true;
  }""",
    "press 按组")

rep("""  function releaseInteract(state, n) {
    if (state.phase !== 'run') return false;
    var car = state.car;
    var part = car.interactives[n - 1];
    if (!part) return false;
    var def = PARTS[part];
    var c = Math.max(0, Math.min(1, car.pumpCharge / 0.8));
    var dv = Params.pumpImpulse * (0.35 + 0.65 * c);
    // 冲量方向 = 零件朝向（0=右 1=上 2=左 3=下），再叠加车体旋转
    var host = car.parts.filter(function (p) { return p.part === part && !p.inner; })[0];
    var v = dirVec(host ? host.dir : 0);
    var ca = Math.cos(car.a), sa = Math.sin(car.a);
    var wx = v[0] * ca - v[1] * sa;
    var wy = v[0] * sa + v[1] * ca;
    car.vx += dv * wx;
    car.vy += dv * wy;
    car.w += 1.2 * (0.4 + 0.6 * c) * (v[0] >= 0 ? 1 : -1);
    log(state, 'pump_release');
    car.pumpCharge = 0;
    car.pumpHeld = false;
    return true;
  }""",
"""  function releaseInteract(state, n) {
    if (state.phase !== 'run') return false;
    var car = state.car;
    var grp = (car.groups || [])[n - 1];
    if (!grp) return false;
    var c = Math.max(0, Math.min(1, car.pumpCharge / 0.8));
    var dv = Params.pumpImpulse * (0.35 + 0.65 * c);
    var ca = Math.cos(car.a), sa = Math.sin(car.a);
    // 同组里每个零件都按自己的朝向推一次（数量越多推力越大）
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
  }""",
    "release 按组")

# ---------- 6) 吃箱子：包围盒判定 ----------
rep("""    // 木箱
    for (var bi = 0; bi < state.boxes.length; bi++) {
      var b = state.boxes[bi];
      if (b.got) continue;
      var bx = b.col + 0.5, by = ter.surfaceY(b.col + 0.5) + 0.5;
      if (Math.abs(car.x - bx) < 1.2 && Math.abs(car.y - by) < 1.5) {
        b.got = true; state.boxesGot++;
        log(state, 'box ' + b.i);
      }
    }""",
"""    // 木箱：车体包围盒（含轮子/挂件）碰到就算吃到
    for (var bi = 0; bi < state.boxes.length; bi++) {
      var b = state.boxes[bi];
      if (b.got) continue;
      var bx = b.col + 0.5, by = ter.surfaceY(b.col + 0.5) + 0.5;
      var hitBox = Math.abs(car.x - bx) < 1.6 && Math.abs(car.y - by) < 1.6;
      if (hitBox) {
        b.got = true; state.boxesGot++;
        log(state, 'box ' + b.i);
      }
    }""",
    "吃箱子放宽")

# ---------- 7) step 里推进自由体 ----------
rep("""    // 木箱：车体包围盒（含轮子/挂件）碰到就算吃到""",
"""    stepLoose(state, dt);

    // 木箱：车体包围盒（含轮子/挂件）碰到就算吃到""",
    "每帧推进自由体")

# ---------- 8) 导出 ----------
rep("    createRun: createRun, step: step, pressInteract: pressInteract,",
    "    createRun: createRun, step: step, stepLoose: stepLoose, pressInteract: pressInteract,",
    "导出 stepLoose")

g.write_text(s, encoding="utf-8")
print("game.js 第一轮修复完成")

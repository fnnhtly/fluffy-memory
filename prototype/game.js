/* 滚蛋吧！猪 · 演示用逻辑核心（纯逻辑，无 DOM）
 * 浏览器里挂到 window.RAP，Node 里 module.exports。
 * 物理：方案 B——整车一个刚体，轮子用"斜坡采样 + 弹簧"贴地，散架只播特效。
 */
(function (root) {
  'use strict';

  // ---------------- 零件表 ----------------
  var PARTS = {
    wood_frame: { label: '木框', mass: 1.2, hp: 3, maxHp: 3, structure: true, color: '#c08a4a', dark: '#8a5f30' , desc: '中空结构件。四边都能挂东西，中间能塞一件（小猪/电池）。耐久 3 段：完好→裂纹→破损→碎。'},
    wood_wheel: { label: '木轮', mass: 0.6, wheel: true, radius: 0.34, grip: 1.0, iceGrip: 0.15, color: '#3a4048', rim: '#8a6a3a' , desc: '木轮，便宜。泥地抓地正常，冰面几乎打滑（0.15），冰坡上不去。'},
    iron_wheel: { label: '铁轮', mass: 0.9, wheel: true, radius: 0.30, grip: 0.9, iceGrip: 0.8, color: '#5a6672', rim: '#c8d2dc' , desc: '铁轮，重 0.3 kg。冰面抓地 0.8，是过冰坡的唯一办法。'},
    motor: { label: '马达', mass: 1.8, motor: true, color: '#e06a4a' , desc: '持续驱动力（6 m/s²），耗能 4/秒，自带 12 电量；没电池只能跑约 3 秒。'},
    battery: { label: '电池', mass: 1.0, energy: 100, inner: true, color: '#8fd66a' , desc: '只能放进木框里。+100 能量，供马达使用。'},
    pump: { label: '打气筒', mass: 0.8, interactive: true, dir: true, thrust: 6.0, color: '#4f8fb0' , desc: '手动交互件。按住蓄力、松开喷出冲量；喷气方向 = 组装时箭头的方向。同色同类零件算一组，按一下整组一起喷。'},
    pig: { label: '小猪', mass: 1.5, hp: 3, pig: true, inner: true, color: '#6fc25a' , desc: '胜负判定对象。必须放进木框里；木框碎了它会掉出来摔在地上，滚停就算失败。'}
  };

  var TRAY_ORDER = ['wood_frame', 'wood_wheel', 'iron_wheel', 'motor', 'battery', 'pump', 'pig'];

  // ---------------- 可调参数（HTML 面板里能改，也是真机的数值基线） ----------------
  var DEFAULTS = {
    gravity: 16.0,
    subSteps: 4,
    motorAccel: 6.0,
    motorEnergy: 4.0,
    pumpImpulse: 6.0,
    wheelGrip: 1.2,
    rollResist: 0.06,   // 高速滚动阻力（低速另有慢速阻力）
    creepBrake: 2.5,
    brakeGrip: 1.6,         // 刹车时轮子抓地倍率
    brakeDecel: 9.0,        // 刹车减速度 m/s²
    groundGrip: 1.0,        // 地面抓地总倍率
    groundFriction: 0.0,    // 着地时整车受到的摩擦减速度（m/s²）
    chassisGrip: 0.75,      // 车壳（木框）静摩擦系数
    drag: 0.02,
    interactCap: 3,
    maxSpeed: 12.0,
    demoTimeLimit: 60
  };

  var MOTOR_BASE_ENERGY = 12;   // 马达自带一点电：只装马达也能跑 7~10 秒

  var Params = Object.assign({}, DEFAULTS);

  function resetParams(over) {
    Object.keys(Params).forEach(function (k) { delete Params[k]; });
    Object.assign(Params, DEFAULTS, over || {});
  }

  // ---------------- 地形 ----------------
  function makeTerrain(level) {
    var g = level.grid;
    var cols = g.cols, rows = g.rows;
    var map = level.mapRows;
    var topRow = new Array(cols);      // 每列最高的实体行
    var material = new Array(cols);    // 该列地表材质
    var mats = level.materials || [];
    for (var c = 0; c < cols; c++) {
      var t = rows;
      for (var r = 0; r < rows; r++) {
        var ch = map[r][c];
        if (ch === '#' || ch === '=' || ch === '@' || ch === 'v' || ch === 'n' || ch === '/') { t = r; break; }
      }
      topRow[c] = t;
      material[c] = 'mud';
      for (var m = 0; m < mats.length; m++) {
        if (c >= mats[m].cols[0] && c <= mats[m].cols[1]) material[c] = mats[m].type;
      }
      // 地表那一格写着 '=' 就是冰（斜坡、台子上的冰也能识别）
      if (topRow[c] < rows && map[topRow[c]][c] === '=') material[c] = 'ice';
      else if (material[c] === 'ice') material[c] = 'mud';
    }
    // 平滑高度场：把"一列抬 1 米"的台阶变成缓坡，避免出现不可通行的 45° 上坡
    var rawH = new Array(cols);
    for (var i0 = 0; i0 < cols; i0++) {
      rawH[i0] = rows - topRow[i0];
      // '@' = 半格台阶：地表比整格高 0.5 米
      if (topRow[i0] < rows && map[topRow[i0]][i0] === '@') rawH[i0] -= 0.5;
    }
    var smoothH = rawH.slice();
    // 硬台阶：这些列不做平滑，保持垂直落差（用于制造"会撞"的地形）
    var hardSet = {};
    (level.hardCols || []).forEach(function (c) { hardSet[c] = true; });
    var kernel = [1, 2, 3, 2, 1];
    for (var pass = 0; pass < 3; pass++) {
      var nextH = smoothH.slice();
      for (var c2 = 0; c2 < cols; c2++) {
        var acc = 0, wsum = 0;
        for (var k = -2; k <= 2; k++) {
          var idx = Math.max(0, Math.min(cols - 1, c2 + k));
          var w = kernel[k + 2];
          acc += smoothH[idx] * w; wsum += w;
        }
        nextH[c2] = acc / wsum;
      }
      smoothH = nextH;
    }

    // 硬台阶列：还原为原始高度（不平滑）
    Object.keys(hardSet).forEach(function (k) {
      var c = Number(k);
      if (c >= 0 && c < cols) smoothH[c] = rawH[c];
    });

    return {
      level: level, cols: cols, rows: rows, map: map,
      topRow: topRow, heightField: smoothH, material: material,
      surfaceY: function (x) {
        // 平滑高度场 + 列间线性插值 → 连续缓坡
        var xc = Math.max(0, Math.min(cols - 1.001, x));
        var c0 = Math.floor(xc);
        var f = xc - c0;
        var c1 = Math.min(cols - 1, c0 + 1);
        return smoothH[c0] + (smoothH[c1] - smoothH[c0]) * f;
      },
      surfaceSlope: function (x) {
        var d = 0.6;
        return (this.surfaceY(x + d) - this.surfaceY(x - d)) / (2 * d);
      },
      matAt: function (x) {
        var c = Math.max(0, Math.min(cols - 1, Math.floor(x)));
        return material[c];
      },
      frictionAt: function (x) {
        var m = this.matAt(x);
        return (m === 'ice') ? 0.05 : (m === 'stone' ? 0.45 : 0.6);
      },
      isSolid: function (c, r) {
        if (c < 0 || c >= cols || r < 0 || r >= rows) return false;
        var ch = map[r][c];
        return ch === '#' || ch === '=' || ch === 'v' || ch === 'n' || ch === '/';
      }
    };
  }

  // ---------------- 组装 ----------------
  var BUILD_COLS = 6, BUILD_ROWS = 8, CELL = 1.0;

  function newBuild() { return { cells: {}, order: [] }; }

  function budgetLeft(level, part, build) {
    var box = level.partsBox || {};
    var total = box[part] || 0;
    var used = 0;
    Object.keys(build.cells).forEach(function (k) {
      var cell = build.cells[k];
      if (cell.part === part) used++;
      if (cell.inner === part) used++;
    });
    return total - used;
  }

  function isInteractive(part) { return !!(PARTS[part] && PARTS[part].interactive); }
  var DIRV = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  function dirVec(dir) { return DIRV[(dir || 0) % 4]; }
  function isDirectional(part) { return !!(PARTS[part] && PARTS[part].dir); }

  function isInnerPart(part) { return !!(PARTS[part] && PARTS[part].inner); }   // 只能放进中空木框

  function interactiveCount(build) {
    var n = 0;
    Object.keys(build.cells).forEach(function (k) {
      if (isInteractive(build.cells[k].part)) n++;
    });
    return n;
  }

  function neighbors(r, c) {
    return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
  }

  function hasNeighborFrame(build, r, c) {
    var ns = neighbors(r, c);
    for (var i = 0; i < ns.length; i++) {
      var cell = build.cells[ns[i][0] + ',' + ns[i][1]];
      if (cell && PARTS[cell.part].structure) return true;
    }
    return false;
  }

  // 只检查、不改数据（渲染层探测专用，避免"每帧推进状态"的 bug）
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
    // 结构件（木框）可以当起点自由放置；其他零件必须贴着结构件
    if (PARTS[part].structure) return { ok: true, reason: '' };
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

  function removeAt(build, r, c) {
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
  }

  function undo(build) {
    var key = build.order.pop();
    if (!key) return false;
    if (key.indexOf('inner:') === 0) {
      var ck = key.slice(6);
      if (build.cells[ck]) build.cells[ck].inner = null;
      return true;
    }
    delete build.cells[key];
    return true;
  }

  function rotateAt(build, r, c) {
    var cell = build.cells[r + ',' + c];
    if (!cell) return false;
    cell.dir = (cell.dir + 1) % 4;
    return true;
  }

  function clearBuild(build) { build.cells = {}; build.order = []; }

  // ---------------- 车 ----------------
  function partPos(r, c) {
    // 建造格 → 车体局部坐标（米）；第 4 行为中线
    return { x: (c - (BUILD_COLS - 1) / 2) * CELL, y: ((BUILD_ROWS - 1) / 2 - r) * CELL };
  }

  // 发射守卫：至少要有 1 个结构件 + 1 个轮子 + 1 只小猪（在木框里）
  function canLaunch(build) {
    var car = buildVehicle(null, build);
    if (!car) return { ok: false, reason: 'empty' };
    if (!car.parts.some(function (p) { return p.def.structure; })) return { ok: false, reason: 'frame' };
    if (!car.wheels.length) return { ok: false, reason: 'wheel' };
    if (!car.hasPig) return { ok: false, reason: 'pig' };
    return { ok: true, reason: '' };
  }

  function buildVehicle(level, build) {
    var parts = [];
    var mass = 0, energy = 0, interactives = [];
    var hasPig = false;
    var groups = [];        // 同种（同色）可启动零件 = 一个组
    Object.keys(build.cells).forEach(function (k) {
      var cell = build.cells[k];
      var rr = parseInt(k.split(',')[0], 10);
      var cc = parseInt(k.split(',')[1], 10);
      var def = PARTS[cell.part];
      var p = partPos(rr, cc);
      parts.push({ part: cell.part, def: def, r: rr, c: cc, lx: p.x, ly: p.y, dir: cell.dir, hp: def.hp || 1 });
      mass += def.mass;
      if (def.energy) energy += def.energy;
      if (def.interactive) {
        interactives.push(cell.part);
        var g0 = groups.filter(function (g) { return g.part === cell.part; })[0];
        if (!g0) { g0 = { part: cell.part, color: def.color, list: [], on: false }; groups.push(g0); }
        g0.list.push(parts[parts.length - 1]);
      }
      if (cell.inner) {
        var idf = PARTS[cell.inner];
        parts.push({ part: cell.inner, def: idf, r: rr, c: cc, lx: p.x, ly: p.y, dir: 0,
                     hp: idf.hp || 1, inner: true, host: k });
        mass += idf.mass;
        if (idf.energy) energy += idf.energy;     // 内嵌电池也要供电
        if (idf.pig) hasPig = true;
      }
    });
    if (!parts.length) return null;
    // 包围盒（仅结构件参与车壳碰撞，和 tumble-piggy 一样）
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    parts.forEach(function (p) {
      if (p.def.structure) {
        minX = Math.min(minX, p.lx - 0.5); maxX = Math.max(maxX, p.lx + 0.5);
        minY = Math.min(minY, p.ly - 0.5); maxY = Math.max(maxY, p.ly + 0.5);
      }
    });
    if (minX > maxX) { minX = -0.5; maxX = 0.5; minY = -0.5; maxY = 0.5; }
    var wheels = parts.filter(function (p) { return p.def.wheel; });
    var motor = parts.some(function (p) { return p.def.motor; });
    var w = maxX - minX, h = maxY - minY;
    var inertia = mass * (w * w + h * h) / 12;
    return {
      parts: parts, wheels: wheels, motor: motor,
      mass: mass, inv: 1 / mass, invI: 1 / Math.max(0.4, inertia),
      hull: { minX: minX, maxX: maxX, minY: minY, maxY: maxY },
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      hasPig: hasPig,
      groups: groups,
      energyMax: energy + (motor ? MOTOR_BASE_ENERGY : 0),
      energy: energy + (motor ? MOTOR_BASE_ENERGY : 0),
      interactives: interactives,
      pumpCharge: 0, pumpHeld: false, braking: false, odo: 0
    };
  }

  // ---------------- 一局 ----------------
  function createRun(level, build) {
    var terrain = makeTerrain(level);
    var car = buildVehicle(level, build);
    var startX = level.start.col + 0.5;
    var startY;
    var state = {
      level: level, terrain: terrain, build: build,
      car: car, phase: 'run',
      time: 0, acc: 0,
      boxes: (level.boxes || []).map(function (b, i) { return { i: i + 1, col: b.col, row: b.row, got: false }; }),
      boxesGot: 0, wallHits: 0, pigHP: 3, motorUse: 0, pumpPress: 0, maxAngle: 0,
      result: null, failReason: '', stars: 0,
      events: [],
      replay: []
    };
    if (!car) { state.phase = 'resolved'; state.failReason = 'empty'; state.result = 'fail'; return state; }
    // 出生高度：让最低接触点正好贴地（有轮子看轮底，没轮子看车壳底）
    var lowest = car.hull.minY;
    if (car.wheels.length) {
      lowest = 0;
      car.wheels.forEach(function (w) { lowest = Math.min(lowest, w.ly - w.def.radius); });
    }
    startY = terrain.surfaceY(startX) - lowest + 0.01;   // 刚好贴地，不再从空中掉下来
    state.car.x = startX;
    state.car.y = startY;
    state.car.a = 0;
    state.car.vx = 0; state.car.vy = 0; state.car.w = 0;
    state.startY = startY;
    state.stuckTimer = 0;
    state.spawnGrace = 0.6;    // 出生保护期：不算结构伤害
    state.loose = [];          // 框碎后掉出来的东西
    return state;
  }

  function log(state, msg) { state.events.push(msg); }

  function worldOf(car, lx, ly) {
    var ca = Math.cos(car.a), sa = Math.sin(car.a);
    return { x: car.x + lx * ca - ly * sa, y: car.y + lx * sa + ly * ca };
  }

  function damageCar(state, vn) {
    if (state.time < (state.spawnGrace || 0)) return;      // 出生落地不算摔
    if (vn < 6) return;
    // 同一段路连续磕碰只算一次（0.35 秒冷却），否则木框会被接触帧打穿
    if (state.time - (state.lastStructHurt || -9) < 0.35) return;
    state.lastStructHurt = state.time;
    var dmg = vn > 14 ? 2 : 1;
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

  function resolve(state, reason) {
    if (state.phase === 'resolved') return;
    state.phase = 'resolved';
    if (reason === 'win') {
      state.result = 'win';
      state.stars = 1;
      if (state.boxesGot === state.boxes.length) state.stars++;
      if (challengePass(state)) state.stars++;
      log(state, 'win stars=' + state.stars + ' box=' + state.boxesGot +
        ' energy=' + Math.round(state.car ? state.car.energy : 0) + ' time=' + state.time.toFixed(1));
    } else {
      state.result = 'fail';
      state.failReason = reason;
      log(state, 'fail ' + reason);
    }
    log(state, 'phase resolved');
  }

  function challengePass(state) {
    var ch = state.level.challenge || { type: 'none' };
    switch (ch.type) {
      case 'none': return false;                      // 1-1 没有 ★★★，最多 2 星
      case 'pumpPress': return state.pumpPress <= (ch.max || 0);
      case 'energyLeft': return state.car && state.car.energy >= (ch.min || 0);
      case 'noFlip': return (state.maxAngle || 0) <= (ch.maxAngle || 0.785);
      case 'motorUse': return state.motorUse <= (ch.max || 0);
      default: return false;
    }
  }

  // 交互键：n = 1..3
  function setBrake(state, on) {
    if (state.phase !== 'run' || !state.car) return false;
    state.car.braking = !!on;
    if (on) log(state, 'brake on');
    return true;
  }

  // n = 第几个"颜色组"（同色同类零件一起响应）
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
  }

  function releaseInteract(state, n) {
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

  // ---------------- 物理步进 ----------------
  function step(state, dt) {
    if (state.phase !== 'run') return;
    var car = state.car, ter = state.terrain;
    if (!car) return;
    var G = Params.gravity;
    var sub = Math.max(1, Math.round(Params.subSteps));
    var h = dt / sub;

    state.time += dt;
    if (state.wallCooldown > 0) state.wallCooldown -= dt;
    if (car.pumpHeld) car.pumpCharge = Math.min(0.8, car.pumpCharge + dt);

    // 马达耗能（没电池时第一帧就报 motor_out，便于用例断言）
    if (car.motor && car.energy <= 0 && !state.motorOutLogged) {
      state.motorOutLogged = true;
      log(state, 'motor_out');
    }
    if (car.motor && car.energy > 0) {
      car.energy = Math.max(0, car.energy - Params.motorEnergy * dt);
      state.motorUse += dt;
      if (car.energy <= 0) log(state, 'motor_out');
    }

    for (var s = 0; s < sub; s++) {
      var fx = 0, fy = -G * car.mass, tq = 0;

      // 空气阻力
      var sp = Math.hypot(car.vx, car.vy);
      if (sp > 0.01) {
        var fd = Params.drag * sp + 0.0008 * sp * sp;
        fx -= fd * car.vx / sp * car.mass;
        fy -= fd * car.vy / sp * car.mass;
      }

      // 轮子
      var groundWheels = 0;
      var driveCap = (car.motor && car.energy > 0) ? car.mass * Params.motorAccel : 0;
      var perWheel = car.wheels.length ? driveCap / car.wheels.length : 0;
      for (var i = 0; i < car.wheels.length; i++) {
        var w = car.wheels[i];
        var wp = worldOf(car, w.lx, w.ly);
        var r = w.def.radius;
        var groundY = ter.surfaceY(wp.x);
        var pen = groundY - (wp.y - r);
        if (pen > 0) {
          groundWheels++;
          var slope = ter.surfaceSlope(wp.x);
          var nl = Math.hypot(-slope, 1);
          var nx = -slope / nl, ny = 1 / nl;         // 地面法线（向上）
          var tx = 1 / nl, ty = slope / nl;          // 切线（向右）
          var rx = wp.x - car.x, ry = wp.y - car.y;
          var vpx = car.vx - car.w * ry, vpy = car.vy + car.w * rx;
          var vn = vpx * nx + vpy * ny;
          var vt = vpx * tx + vpy * ty;
          var N = Math.max(0, Math.min(320 * pen - 50 * vn, 2.5 * car.mass * G));
          // 冰面上不看地形摩擦，直接看轮子的冰面抓地（铁轮 0.8 / 木轮 0.15）
          var baseMu = (ter.matAt(wp.x) === 'ice') ? 1.0 : ter.frictionAt(wp.x);
          var mu = baseMu * w.def.grip * (ter.matAt(wp.x) === 'ice' ? w.def.iceGrip : 1) * Params.wheelGrip;
          if (car.braking) mu *= Params.brakeGrip;
          var cap = mu * N;
          var drive = Math.max(-cap, Math.min(cap, perWheel));
          // 滚动阻力很小，否则车下坡后立刻被刹停（这是"重力即动力"关卡的前提）
          // 低速时滚动阻力大得多（'木头咬地'），高速保持小阻力（惯性关卡要）
          var slowWheel = Math.hypot(car.vx, car.vy) < 3.0;
          var rollMu = (slowWheel ? 0.14 : Params.rollResist) * (Params.groundGrip || 1);
          var roll = rollMu * N * Math.sign(vt);
          var Ft = Math.max(-cap, Math.min(cap, drive - roll));
          fx += nx * N + tx * Ft;
          fy += ny * N + ty * Ft;
          tq += 0.5 * (rx * (ny * N + ty * Ft) - ry * (nx * N + tx * Ft));  // 轮子力矩打 5 折，防止磕台阶就翻
          if (Params.collectContacts) Params.collectContacts.push(+Math.abs(vn).toFixed(2));
          // 分级接触反馈（写进事件流，渲染层消费）
          var vnAbs = Math.abs(vn);
          if (vn < -0.8 && vnAbs > 0.8) {
            var lvl = vnAbs > 6 ? 4 : (vnAbs > 4.5 ? 3 : (vnAbs > 2.5 ? 2 : 1));
            var lastKey = 'lastTouch' + lvl;
            if (!state[lastKey] || state.time - state[lastKey] > 0.06) {
              state[lastKey] = state.time;
              log(state, 'touch lvl=' + lvl + ' v=' + vnAbs.toFixed(1) + ' x=' + wp.x.toFixed(1));
            }
          }
          if (vn < -0.8) {
            if (Math.abs(vn) > 6) { log(state, 'impact v=' + Math.abs(vn).toFixed(1) + ' at=' + w.r + ',' + w.c); damageCar(state, Math.abs(vn)); }
          }
        }
      }

      // 贴地稳定器：两个轮子都在地上时，把车体角度拉向地面坡度（避免一直俯仰、车头蹭地）
      if (groundWheels >= 2) {
        var targetA = Math.atan(ter.surfaceSlope(car.x));
        // 弹簧 + 临界阻尼：拉角度 + 压掉角速度（避免落地后晃两下）
        var err = targetA - car.a;
        car.w += err * 7.5 * h;
        car.w *= (1 - Math.min(0.9, 2.2 * h));
      }

      // 车壳四角（含无轮子时的支撑）
      var hb = car.hull;
      var ins = 0.08;
      var corners = [[hb.minX + ins, hb.minY + ins], [hb.maxX - ins, hb.minY + ins],
                     [hb.minX + ins, hb.maxY - ins], [hb.maxX - ins, hb.maxY - ins]];
      for (var k = 0; k < corners.length; k++) {
        var cp = worldOf(car, corners[k][0], corners[k][1]);
        var gy = ter.surfaceY(cp.x);
        var pn = gy - cp.y;
        if (pn > 0) {
          var sl = ter.surfaceSlope(cp.x);
          var nl2 = Math.hypot(-sl, 1);
          var nx2 = -sl / nl2, ny2 = 1 / nl2;
          var tX = 1 / nl2, tY = sl / nl2;
          var rx2 = cp.x - car.x, ry2 = cp.y - car.y;
          var vpx2 = car.vx - car.w * ry2, vpy2 = car.vy + car.w * rx2;
          var vn2 = vpx2 * nx2 + vpy2 * ny2;
          var vt2 = vpx2 * tX + vpy2 * tY;
          groundWheels = Math.max(groundWheels, 1);   // 车壳蹭地也算贴地
          var N2 = Math.max(0, Math.min(900 * pn - 70 * vn2, 3.0 * car.mass * G));
          // 车壳角点只有一点温和的切向摩擦：完全没有摩擦的话，没轮子的车会一路滑到终点
          var noWheel = (car.wheels.length === 0);   // 没轮子时是车壳在拖地
          // 真库仑摩擦：所需力 = 在这个子步内把滑动刹住（m·v/h），再被 μN 截断。
          // 慢速会被牢牢粘住、高速蹭地才滑出去 —— 这才像木头蹭地。
          var gripMu = (ter.matAt(cp.x) === 'ice')
            ? 0.10
            : ((Params.chassisGrip || 0.5) * (Params.groundGrip || 1) * ter.frictionAt(cp.x) / 0.6);
          if (noWheel) gripMu *= 1.6;
          var cap2 = gripMu * N2;
          var need = Math.abs(vt2) * car.mass / Math.max(1e-5, h);
          var Ft2 = -Math.sign(vt2) * Math.min(need, cap2);
          fx += nx2 * N2 + tX * Ft2;
          fy += ny2 * N2 + tY * Ft2;
          tq += rx2 * (ny2 * N2 + tY * Ft2) - ry2 * (nx2 * N2 + tX * Ft2);
          if (Params.collectContacts) Params.collectContacts.push(+Math.abs(vn2).toFixed(2));
          if (vn2 < -6) { log(state, 'impact v=' + Math.abs(vn2).toFixed(1) + ' at=chassis'); damageCar(state, Math.abs(vn2)); }
        }
      }

      // ---- 整车地面摩擦（真正决定"滑不滑"的量）----
      // 几何判断是否贴地：车体最低点离地表 ≤ 0.3 m 就算在地上
      var hullBottom = worldOf(car, 0, car.hull.minY).y;
      var groundGap = hullBottom - ter.surfaceY(car.x);
      var onGround = (groundWheels > 0) || (groundGap < 0.3);
      if (onGround) {
        var vh = Math.hypot(car.vx, car.vy);
        if (vh > 0.02) {
          var mat = ter.matAt(car.x);
          var gMul = mat === 'ice' ? 0.08 : (mat === 'stone' ? 0.75 : 1.0);
          var gf = Params.groundFriction * (Params.groundGrip || 1) * gMul;
          // 有动力输出/刹车时不要额外钉住（马达要能推动车、刹车已有自己的减速度）
          var powered = (car.motor && car.energy > 0) ||
            (car.groups || []).some(function (gr) { return gr.on; }) || car.braking;
          if (!powered) {
            var dec = Math.min(vh, gf * h);
            car.vx -= dec * car.vx / vh;
            car.vy -= dec * car.vy / vh;
          }
        }
      }

      car.vx += fx * car.inv * h;
      car.vy += fy * car.inv * h;
      car.w += tq * car.invI * h;
      var spd = Math.hypot(car.vx, car.vy);
      if (spd > Params.maxSpeed) { car.vx *= Params.maxSpeed / spd; car.vy *= Params.maxSpeed / spd; }
      car.vx *= (1 - 0.025 * h);
      car.w *= (1 - 3.4 * h);
      // 刹车：直接给一个反向减速度（轮胎咬死），低速时彻底停住
      if (car.braking) {
        var sb = Math.hypot(car.vx, car.vy);
        if (sb > 0.05) {
          var dvb = Math.min(sb, Params.brakeDecel * h);
          car.vx -= dvb * car.vx / sb;
          car.vy -= dvb * car.vy / sb * 0.4;
          car.w *= 0.70;   // 落地压角速度
        }
      }
      // 蠕行刹车：慢于 1.5 m/s 且没有动力在输出时，额外阻尼，避免"永远滑一点点"
      var spNow = Math.hypot(car.vx, car.vy);
      var driving = (car.motor && car.energy > 0) ||
        (car.groups || []).some(function (g) { return g.on; });
      if (!driving && spNow < 1.5) {
        var k = 1 - Params.creepBrake * (1 - spNow / 1.5) * h;
        car.vx *= Math.max(0, k);
        car.vy *= Math.max(0, k);
      }
      car.x += car.vx * h;
      car.odo = (car.odo || 0) + Math.abs(car.vx * h);   // 里程（轮子自转用）
      car.y += car.vy * h;
      car.a += car.w * h;
    }

    stepLoose(state, dt);

    // 木箱
    for (var bi = 0; bi < state.boxes.length; bi++) {
      var b = state.boxes[bi];
      if (b.got) continue;
      var bx = b.col + 0.5, by = ter.surfaceY(b.col + 0.5) + 0.5;
      if (Math.abs(car.x - bx) < 1.7 && Math.abs(car.y - by) < 1.7) {   // 放宽：车体碰到就算
        b.got = true; state.boxesGot++;
        log(state, 'box ' + b.i);
      }
    }

    // 终点 / 失败
    if (car.x >= state.level.goal.col) { resolve(state, 'win'); return; }   // 车身到达旗子所在格即算到
    if (car.y < -2 || car.x < -2 || car.x > ter.cols + 2) { resolve(state, 'out_of_bounds'); return; }
    state.maxAngle = Math.max(state.maxAngle || 0, Math.abs(car.a));
    var sp2 = Math.hypot(car.vx, car.vy);
    if (sp2 < 0.2) {
      state.stuckTimer += dt;
      if (state.stuckTimer > 5) { resolve(state, 'stuck'); return; }
    } else state.stuckTimer = 0;
    if (state.time > Params.demoTimeLimit) { resolve(state, 'timeout'); return; }

    // 回放缓冲（3 秒）
    if (state.replay.length === 0 || state.time - state.replay[state.replay.length - 1].t > 1 / 20) {
      state.replay.push({ t: state.time, x: car.x, y: car.y, a: car.a });
      while (state.replay.length > 60) state.replay.shift();
    }
  }

  // ---------------- 测试脚手架：不开浏览器也能跑一局 ----------------
  var SPECS = {
    // 每关的标准解（与 tests/cases.md 的点击序列一致）
    '1-1': { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]] },
    '1-2': { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pump: [[3, 2]], pig: [[4, 2]] },
    '1-3': { wood_frame: [[4, 1], [4, 2], [4, 3], [4, 4]], wood_wheel: [[5, 1], [5, 4]], motor: [[4, 0]], battery: [[4, 3]], pig: [[4, 2]] },
    '1-4i': { wood_frame: [[4, 1], [4, 2], [4, 3], [4, 4]], iron_wheel: [[5, 1], [5, 4]], motor: [[4, 0]], battery: [[4, 3]], pig: [[4, 2]] },
    '1-4w': { wood_frame: [[4, 1], [4, 2], [4, 3], [4, 4]], wood_wheel: [[5, 1], [5, 4]], motor: [[4, 0]], battery: [[4, 3]], pig: [[4, 2]] },
    '1-5m': { wood_frame: [[4, 0], [4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 0], [5, 3]], motor: [[4, 4]], pig: [[4, 1]] },
    '1-5n': { wood_frame: [[4, 0], [4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 0], [5, 3]], pig: [[4, 1]] }
  };

  function applySpec(level, build, spec) {
    Object.keys(spec).forEach(function (part) {
      spec[part].forEach(function (rc) {
        tryPlace(level, build, part, rc[0], rc[1]);
      });
    });
    return build;
  }

  function simulate(level, spec, opts) {
    opts = opts || {};
    resetParams(opts.params);
    var build = newBuild();
    applySpec(level, build, spec);
    var state = createRun(level, build);
    var dt = 1 / 60;
    var maxT = opts.maxTime || 70;
    while (state.phase === 'run' && state.time < maxT) step(state, dt);
    return state;
  }

  var RAP = {
    canLaunch: canLaunch,
    dirVec: dirVec,
    isDirectional: isDirectional,
    PARTS: PARTS, TRAY_ORDER: TRAY_ORDER, DEFAULTS: DEFAULTS, Params: Params,
    BUILD_COLS: BUILD_COLS, BUILD_ROWS: BUILD_ROWS, CELL: CELL,
    resetParams: resetParams, makeTerrain: makeTerrain,
    newBuild: newBuild, tryPlace: tryPlace, canPlace: canPlace, removeAt: removeAt, undo: undo,
    rotateAt: rotateAt, clearBuild: clearBuild, budgetLeft: budgetLeft,
    interactiveCount: interactiveCount, buildVehicle: buildVehicle,
    createRun: createRun, step: step, stepLoose: stepLoose, damageCar: damageCar, setBrake: setBrake, pressInteract: pressInteract,
    releaseInteract: releaseInteract, challengePass: challengePass,
    SPECS: SPECS, applySpec: applySpec, simulate: simulate, partPos: partPos
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RAP;
  else root.RAP = RAP;
})(typeof globalThis !== 'undefined' ? globalThis : this);

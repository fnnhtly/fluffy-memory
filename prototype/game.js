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
    /* 气球与沙袋是参考里最漂亮的一对：气球给浮力、沙袋给配重，
     * 玩家靠"什么时候抛沙袋、什么时候扎气球"控制高度。
     *
     * 和参考的**有意差异**：参考里一格能放 1/2/3 个，是三种独立道具（三个独立预算槽）。
     * 我们做成一个零件 + 叠加数量（再点一次同一格 → 数量 +1，到 3 回绕到 1），
     * 因为托盘已经有 7 项、再塞 5 项会挤爆；而"一格多个"的语义、以及总预算按个数算，
     * 这两条都保住了。预算里 `balloon: 6` 就是"总共 6 个气球，随便怎么分布"。
     *
     * liftMass = 每个气球能"举起"多少 kg（浮力 = liftMass · n · G）。
     * 用 kg 而不是牛顿，是因为玩家心里的秤是 kg（HUD 上写着总重）。
     * 1.2 是量出来的：4 个气球能举起 4.8 kg，正好让"最轻的车 + 丢掉沙袋"浮起来，
     * 而 6 个气球配轻车会直接冲进暴风层（这就是关卡要教的那件事）。
     *
     * **操作方式是"行驶中点车身"，不是面板按钮**（`tapOnBody`）——
     * 面板那三个键位要留给打气筒/风扇这些真正的驱动件。文案必须照实说，
     * 这里曾经写"按按钮主动扎"，和实现对不上，玩家会一直找那个不存在的按钮。 */
    balloon: { label: '气球', stack: true, maxStack: 3, liftMass: 1.2, mass: 0.05,
               interactive: true, tapOnBody: true, popOnGround: true, color: '#e0708f',
               desc: '每格最多 3 个（再点一次同一格 → +1，到 3 换回 1）。每个能把 1.2 kg 举起来。行驶中点车身就能扎破一个；碰地也会自己破。' },
    sandbag: { label: '沙袋', stack: true, maxStack: 3, mass: 0.8,
               interactive: true, tapOnBody: true, dropOne: true, color: '#b79b6a',
               desc: '每格最多 3 个。纯粹是重量（每个 0.8 kg）——压住气球不让它飞、顺便压住车少弹。行驶中点车身就能扔一个，重量立刻变小。' },
    pig: { label: '小猪', mass: 1.5, hp: 3, pig: true, inner: true, color: '#6fc25a' , desc: '胜负判定对象。必须放进木框里；木框碎了它会掉出来摔在地上，滚停就算失败。'}
  };

  var TRAY_ORDER = ['wood_frame', 'wood_wheel', 'iron_wheel', 'motor', 'battery', 'pump', 'balloon', 'sandbag', 'pig'];

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
    /* 蠕行刹车的放行坡度（|tan| 阈值）。
     * 滚动阻力是 0.14，所以坡度小于 0.14 的"斜坡"在物理上本来就不该动；
     * 取 0.12 让这一点点缓坡仍会被刹住，而真正能滚的坡不被吃掉。 */
    creepMinSlope: 0.12,
    brakeGrip: 1.6,         // 刹车时轮子抓地倍率
    brakeDecel: 9.0,        // 刹车减速度 m/s²
    groundGrip: 1.0,        // 地面抓地总倍率
    groundFriction: 0.0,    // 着地时整车受到的摩擦减速度（m/s²）
    chassisGrip: 0.75,      // 车壳（木框）静摩擦系数
    drag: 0.02,
    /* 上升速度硬上限（m/s），只在车上有气球时生效。
     * 试过"用空气阻力收敛终端速度"，不行：终端速度 = G·(lift−m)/(k·lift)，
     * 对净浮力极度敏感 —— 6 个气球只有 0.46 m/s（看不出在飞），
     * 少挂一个又完全不飞。玩家学不到可预期的规则。
     * 改成硬封顶后规则是一句话：**带得起来就以 2.5 m/s 匀速上升**，
     * 与挂几个气球无关，只与"带不带得起来"有关（net = mass − lift < 0）。
     * 2.5 m/s 是量出来的：1 秒爬 2.5 米（2.5 格），跨 6 米沟要 2.4 秒，
     * 玩家有足够时间决定"要不要扎"。 */
    liftMaxRise: 2.5,
    /* 到终点时车身离终点地表的允许高度差。
     * 车静止时车心离地 1.3–1.6 米（实测 1-1..1-5 的标准解都是这个区间），
     * 所以 2.2 足够"停在旗子旁边"，但容不下"从旗子上空飞过去"。
     * 没有这条的话，气球流就是"挂一堆气球飘过终点线"——这关白设计。 */
    goalMaxAlt: 2.2,
    interactCap: 3,
    maxSpeed: 12.0,
    demoTimeLimit: 60,
    /* ---------- 「没有进展」看门狗 ----------
     *
     * 为什么需要它：随机造法 × 六关跑 360 局，有 21 局是**跑满 60 秒才判 timeout** 的。
     * 那份 trace 显示这些车并没有停 —— 它们以 0.2~0.4 m/s 在坡上慢慢溜，
     * 速度高于 stuck 的 0.2 m/s 阈值，所以 stuck 永远不触发。
     * 1-5 上「单框 + 单轮」就是这样：60 秒爬到 x=14.95（终点 25），
     * 然后顶在墙前不动 —— 玩家这 60 秒既没法操作，也没有希望。
     *
     * 判据（量的，不是猜的）：**W 秒内「距终点」没缩小 D 米，并且高度没上升 D 米**。
     *   - 只判 x 会误杀气球流（横向慢，但一路在爬升）→ 所以加上高度这一条；
     *   - 只判"动了没有"会漏掉这些慢慢溜的车 → 所以判的是"朝终点的进展"。
     *
     * 阈值是扫出来的（tools/sweep_watchdog.js，8 组 (W,D) × 289 个失败局样本）：
     *   W=8, D=2  → 期望速度 0.25 m/s，**误杀获胜局 0 局**，标准解 0 触发，
     *   抓到 71/289 局，平均每局省 20.2 秒。
     * 更严的 (6, 1.5) 抓得多但省得少（很多局本来 5 秒就 stuck 了）；
     * 更松的 (12, 2) 只抓到 23 局。
     * 标准解的最长"无实质进展"实测只有 1.6 秒（1-6，升空那一段），
     * 离 8 秒有 5 倍余量 —— 这就是它不会误杀的依据。 */
    progressWindow: 8.0,
    progressGain: 2.0
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

  function newBuild() { return { cells: {}, order: [], hist: [] }; }

  /* 数量：一格能叠几个（气球/沙袋最多 3，其余恒为 1）。
   * 之所以用"一个零件 + 数量"而不是参考里的三个独立道具：
   * 托盘已经 9 项了，再拆成 5 项会挤爆；而"一格能放多个"和"总预算按个数算"
   * 这两条语义都保住了。 */
  function cellCount(cell) { return (cell && cell.n) || 1; }

  function budgetLeft(level, part, build) {
    var box = level.partsBox || {};
    var total = box[part] || 0;
    var used = 0;
    Object.keys(build.cells).forEach(function (k) {
      var cell = build.cells[k];
      if (cell.part === part) used += cellCount(cell);
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
      /* 气球/沙袋不算进"交互键上限"。
       * 那条上限的用意是"控制面板别超过 3 个键"（交互件即键位），
       * 而气球/沙袋在参考里是**直接在车身上点破/点掉**的消耗品，不是驱动控制键，
       * 所以我们让它们走"点车身"这条路径，不占面板额度（见 popBalloon / dropSandbag）。 */
      if (isInteractive(build.cells[k].part) && !PARTS[build.cells[k].part].tapOnBody) n++;
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

    var there = build.cells[key];
    if (there) {
      /* 已放的同类可叠件 → 数量 +1；到 maxStack 之后回到 1。
       * 回到 1 而不是弹"满了"，是因为玩家最常见的动作就是"点多了想减"，
       * 而这一格上除了数量没有别的东西可点 —— 回绕比拒绝更省事。
       *
       * 预算检查只拦"往上加"，不拦"往下减"：6 个气球全放下之后，
       * 玩家仍然要能把某一格改回 1 个。 */
      if (there.part === part && PARTS[part].stack) {
        var cur = cellCount(there);
        var nxt = cur >= (PARTS[part].maxStack || 3) ? 1 : cur + 1;
        if (nxt > cur && budgetLeft(level, part, build) <= 0) return { ok: false, reason: 'budget' };
        return { ok: true, reason: '', stacked: true, n: nxt };
      }
      // 已放的同类方向件 → 可旋转
      if (there.part === part && isDirectional(part)) {
        return { ok: true, reason: '', rotated: true, dir: ((there.dir || 0) + 1) % 4 };
      }
      return { ok: false, reason: 'occupied' };
    }

    if (budgetLeft(level, part, build) <= 0) return { ok: false, reason: 'budget' };
    // 气球/沙袋走"点车身"，不占面板键位（见 interactiveCount 的注释）
    if (isInteractive(part) && !PARTS[part].tapOnBody && interactiveCount(build) >= Params.interactCap) {
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
    pushHistory(build);          // 任何一次成功的写入都是一个可撤销的"一步"
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
    if (chk.stacked) {
      build.cells[key].n = chk.n;
      return { ok: true, reason: '', stacked: true, n: chk.n };
    }
    build.cells[key] = { part: part, dir: 0, n: PARTS[part].stack ? 1 : undefined };
    build.order.push(key);
    return { ok: true, reason: '' };
  }

  function removeAt(build, r, c, opts) {
    var key = r + ',' + c;
    var cell = build.cells[key];
    if (!cell) return false;
    /* opts.quiet：同一次"橡皮划一笔"里的后续格子不再各记一步。
     * 一笔扫过 5 格应该有 1 个撤销步，不是 5 个 —— 玩家心里那是"一次擦除"。 */
    if (!(opts && opts.quiet)) pushHistory(build);
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

  /* 撤销 = 回到上一步的**整张图纸**，不是"删掉最后放下的那一件"。
   *
   * 原来是 `build.order.pop()` 再删掉那一格。而 order 只在**放下**时 push、
   * 在拆掉时 splice —— 被拆掉的东西压根不在 order 里。于是：
   *   · 用橡皮擦掉一格再按 Z → 删掉的不是它，而是 order 末尾那件
   *     （实测：擦掉一个气球后按 Z，**车上唯一的小猪被删了**）
   *   · 拖出网格卸下之后按 Z → 同上，而且卸下的那件也回不来
   * 也就是说这个按钮当时的实际行为是"主动毁掉玩家的零件"，不是"没用"。
   *
   * 现在记快照：每个改动图纸的**命令**进来前先压一份 cells+order 深拷贝，
   * Z 整个恢复上一份。这样"撤销"和"我上一步做了什么"永远一致，
   * 不管那一步是放、拆、转、清空，还是从车上拖出去。
   * 快照是命令式的、必须由改动方显式调用（pushHistory），
   * 不靠"猜哪一次改动算一步"。 */
  var HIST_CAP = 40;

  function snapBuild(build) {
    var cells = {};
    Object.keys(build.cells).forEach(function (k) {
      var c = build.cells[k];
      cells[k] = { part: c.part, dir: c.dir, inner: c.inner, n: c.n };
    });
    return { cells: cells, order: build.order.slice() };
  }

  function pushHistory(build) {
    if (!build.hist) build.hist = [];
    build.hist.push(snapBuild(build));
    if (build.hist.length > HIST_CAP) build.hist.shift();
  }

  function undo(build) {
    if (!build.hist || !build.hist.length) return false;
    var s = build.hist.pop();
    build.cells = s.cells;
    build.order = s.order;
    return true;
  }

  /* 丢回上一步快照：给"开了头但实际没改动任何东西"的操作用来收尾。
   * 拖拽换格子被占 → 零件弹回原格，图纸净变化为零，
   * 那就不能留下一步"撤销了等于没撤"的空步（按 Z 没反应比按 Z 乱删更吓人）。 */
  function dropHistory(build) {
    if (build.hist && build.hist.length) build.hist.pop();
  }

  function rotateAt(build, r, c) {
    var cell = build.cells[r + ',' + c];
    if (!cell) return false;
    pushHistory(build);
    cell.dir = (cell.dir + 1) % 4;
    return true;
  }

  function clearBuild(build) {
    if (Object.keys(build.cells).length === 0 && build.order.length === 0) return;
    pushHistory(build);
    build.cells = {}; build.order = [];
  }

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
      var cnt = cellCount(cell);
      /* 可叠零件（气球/沙袋）：一个格子代表 cnt 个物理件。
       * 质量按个数算；气球还要记下自己 lifts 多少 kg（浮力）。
       * 这里把 cnt 存到零件上，是为了"扔一个"之后能就地减一，
       * 而不必重建整车（重建会丢速度、丢 HP，也会让回放跳变）。 */
      var isStack = !!def.stack;
      var pm = def.mass * (isStack ? cnt : 1);
      parts.push({ part: cell.part, def: def, r: rr, c: cc, lx: p.x, ly: p.y, dir: cell.dir,
                   hp: def.hp || 1, n: isStack ? cnt : 1, key: k });
      mass += pm;
      if (def.energy) energy += def.energy;
      if (def.interactive) {
        // 只有"占面板键位"的交互件才进 groups；气球/沙袋走点车身
        if (!def.tapOnBody) {
          interactives.push(cell.part);
          var g0 = groups.filter(function (g) { return g.part === cell.part; })[0];
          if (!g0) { g0 = { part: cell.part, color: def.color, list: [], on: false }; groups.push(g0); }
          g0.list.push(parts[parts.length - 1]);
        }
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
    var car = {
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
    recomputeLift(car);
    return car;
  }

  /* 浮力：气球每个 lifts `liftMass` kg，等效"负重量"。
   * 存成 `liftMass`（kg）而不是力（N），是因为重力是可调参数 ——
   * 用 kg 表达的话，改重力时气球和车一起变重变轻，浮沉关系不乱。
   * netMass = 真实质量 - 浮力质量：>0 会往下掉，<0 会往上飘。 */
  function recomputeLift(car) {
    var lift = 0, bags = 0;
    car.parts.forEach(function (p) {
      if (p.def.liftMass) lift += p.def.liftMass * (p.n || 1);
      if (p.def.dropOne) bags += (p.n || 1);
    });
    car.liftMass = lift;
    car.sandbagCount = bags;
    car.netMass = car.mass - lift;
    return car;
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
      // 气球/沙袋的消耗记账（给三星条件用：「一个气球都不破」「沙袋全扔」之类）
      balloonPops: 0, balloonPopsBurst: 0, sandbagsDropped: 0,
      /* 出发时一共带了几个沙袋 —— 「沙袋全扔」这颗星要在 HUD 上显示 已扔/总数，
       * 而扔到中途时 build 里那格的数量已经变了，所以必须在出发那一刻结算一次。
       * 和 challengePass 里的算法保持同一份（那边现在也读这个字段）。 */
      sandbagTotal: (function (b) {
        var t = 0;
        Object.keys(b.cells || {}).forEach(function (k) {
          var c = b.cells[k];
          if (PARTS[c.part] && PARTS[c.part].dropOne) t += cellCount(c);
        });
        return t;
      })(build),
      // 「不散架 KRAK SNAP」用：参考里这一颗星要求"载具没散架，且猪没从载具里掉出来"。
      // 两个标记必须分开，因为"框碎了但猪还卡在上面"和"框好好的猪却掉出来了"都该判失败。
      hullBroken: false, pigEjected: false,
      result: null, failReason: '', stars: 0,
      // 三颗星各自独立达成（参考的累计制）：到终点 / 全木箱 / 挑战条件
      starGoals: { arrive: false, boxes: false, challenge: false },
      /* 「没有进展」看门狗的历史采样（见 Params.progressWindow 的注释）。
       * 每帧塞一条 {t, left, y}，超过窗口就丢 —— 只需要 W 秒的历史。
       * 挂在这里而不是全局，是因为它必须随这一局一起消失。 */
      progHist: [],
      /* 上一次"达成进展"的时刻 + 已经多久没进展了。
       * noGainFor 由引擎每帧写入，HUD 直接读它画倒计时警告 ——
       * 这样"什么时候判负"和"界面上还剩几秒"永远是同一个数。 */
      progLastGainT: 0, noGainFor: 0,
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

  /* 气球扎破的碎片：写进事件流交给渲染层（和 impact 同一套消费方式）。
   * 物理层不生成特效对象 —— 那个职责在 index.html 的 spawnDebris。 */
  function spawnBurst(state, x, y) { log(state, 'burst x=' + x.toFixed(1) + ' y=' + y.toFixed(1)); }

  /* 质量类字段只能通过这里改。
   * 以前 `damageCar` 里手写了一遍（重算 mass/inv/wheels），现在多了一个
   * 会改质量的路径（扔沙袋），两处手写迟早会分叉 —— 统一收进来。 */
  function syncCarMass(car) {
    var m = 0;
    car.parts.forEach(function (p) { m += p.def.mass * (p.n || 1); });
    car.mass = m > 0 ? m : 0.01;
    car.inv = 1 / car.mass;
    car.wheels = car.parts.filter(function (p) { return p.def.wheel; });
    var w = car.hull.maxX - car.hull.minX, h = car.hull.maxY - car.hull.minY;
    var inertia = car.mass * (w * w + h * h) / 12;
    car.invI = 1 / Math.max(0.4, inertia);
    recomputeLift(car);
    return car;
  }

  /* 消耗一件可叠零件。
   * 返回 { ok, kind, left, part } —— kind 是 'balloon' / 'sandbag'。
   * 用"就地减一"而不是"重建整车"：重建会丢速度、丢 HP，回放也会跳变。
   * `which` 可以指定具体那一格的零件（碰地扎破时要扎破**这一个**，
   * 不能随便挑一个 —— 挑错了玩家会觉得"我没碰到的气球凭什么破"）。 */
  function consumeStack(state, part, n, which) {
    if (state.phase !== 'run' || !state.car) return { ok: false };
    n = n || 1;
    var pick = null;
    if (which && which.def === part && (which.n || 0) >= n) {
      pick = which;
    } else {
      for (var i = 0; i < state.car.parts.length; i++) {
        if (state.car.parts[i].def === part && (state.car.parts[i].n || 0) >= n) { pick = state.car.parts[i]; break; }
      }
    }
    if (!pick) return { ok: false };
    pick.n -= n;
    var kind = pick.def.liftMass ? 'balloon' : 'sandbag';
    var left = Math.max(0, pick.n);
    if (pick.n <= 0) {
      var idx = state.car.parts.indexOf(pick);
      if (idx >= 0) state.car.parts.splice(idx, 1);
      state.car.groups.forEach(function (g) {
        var j = g.list.indexOf(pick); if (j >= 0) g.list.splice(j, 1);
      });
    }
    return { ok: true, kind: kind, left: left, part: pick, at: { x: pick.lx, y: pick.ly } };
  }

  /* 主动扎破一个气球 / 扔一个沙袋。
   * 两者共用一套"消耗 + 记账 + 同步质量"，因为对物理来说它们是同一件事：
   * 少了一个会改质量（和浮力）的件。差别只在计数器和事件名。 */
  function popBalloon(state, which) {
    var r = consumeStack(state, PARTS.balloon, 1, which);
    if (!r.ok) return false;
    state.balloonPops = (state.balloonPops || 0) + 1;
    syncCarMass(state.car);
    log(state, 'balloon_pop left=' + state.car.liftMass.toFixed(2));
    /* 炸点在**被扎破的那个气球原位**（用 r.at 的局部坐标换算到世界），
     * 不是车心 —— 玩家点的是气球，碎片就该从气球那个位置炸开。
     * 主动扎和碰地扎共用这条事件，所以渲染层只有一处要认 'burst'。 */
    var bp = worldOf(state.car, r.at.x, r.at.y);
    spawnBurst(state, bp.x, bp.y);
    return true;
  }

  function dropSandbag(state, which) {
    var r = consumeStack(state, PARTS.sandbag, 1, which);
    if (!r.ok) return false;
    state.sandbagsDropped = (state.sandbagsDropped || 0) + 1;
    syncCarMass(state.car);
    // 沙袋落地：视觉用的自由体（和框碎掉出来的东西同一套）
    var wp = worldOf(state.car, r.at.x, r.at.y);
    state.loose.push({
      part: 'sandbag', x: wp.x, y: wp.y,
      vx: state.car.vx * 0.8, vy: state.car.vy * 0.5,
      a: 0, w: (Math.random() - 0.5) * 5, r: 0.3, rest: 0
    });
    log(state, 'sandbag_drop left=' + state.car.sandbagCount);
    return true;
  }

  /* 点车身：在世界坐标 (wx, wy) 附近找气球/沙袋并消耗一个。
   * 为什么不做成面板按钮：面板已经有"交互键上限 3"，而参考里这两件是
   * 直接在车身上点破/点掉的消耗品，不是驱动器。做成按钮会把打气筒/电风扇
   * 那些真正的控制键挤掉。也正因为如此它们**不占** interactCap 额度。 */
  function tapAt(state, wx, wy) {
    if (state.phase !== 'run' || !state.car) return null;
    var best = null, bestD = 1e9;
    state.car.parts.forEach(function (p) {
      if (!p.def.stack) return;
      var wp = worldOf(state.car, p.lx, p.ly);
      var d = Math.hypot(wp.x - wx, wp.y - wy);
      if (d < bestD) { bestD = d; best = p; }
    });
    if (!best || bestD > 0.85) return null;
    var kind = best.def.liftMass ? 'balloon' : 'sandbag';
    var ok = kind === 'balloon' ? popBalloon(state) : dropSandbag(state);
    return ok ? { ok: true, kind: kind, part: best } : null;
  }

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
    /* 伤害分档必须和"物理上真的到得了的速度"对齐。
     * 旧代码写的是 `vn > 14 ? 2 : 1`，但 Params.maxSpeed = 12 给整车速度设了硬上限，
     * 实测 30 米自由落体砸地也只能到 11.97 m/s —— 那个 2 点档是**死档**，
     * 永远进不去。改成下面的三段，每一段都实测可达：
     *   6 ~ 8   磕一下      1 点（木框裂一道）
     *   8 ~ 11  撞狠了      2 点（木框接近散）
     *   ≥ 11    从高处砸下来 直接散架（这一档只有坠落能触发，平地跑最快也才 2.3）
     * 平地正常跑起来的最大法向速度约 2.3 m/s，所以这三档在日常通关里都不会误伤。 */
    var dmg = vn >= 11 ? 9 : (vn >= 8 ? 2 : 1);
    var broken = [];
    state.car.parts.forEach(function (p) {
      if (!p.def.structure) return;
      p.hp -= dmg;
      if (p.hp <= 0) broken.push(p);
    });
    if (broken.length) {
      state.hullBroken = true;      // 「不散架」星：哪怕只碎一格，这颗星就没了
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
        if (p.def.pig) {
          state.car.hasPig = false; state.pigLooseAt = state.time;
          state.pigEjected = true;   // 「不散架」星：猪掉出来了，这颗星也没了
        }
      });
      state.car.parts = state.car.parts.filter(function (p) {
        return broken.indexOf(p) < 0 && !(p.inner && brokenKeys.indexOf(p.host) >= 0);
      });
      syncCarMass(state.car);
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

  function failLabel(reason) {
    return ({
      pig_dead: 'pig_dead', pig_lost: 'pig_lost', out_of_bounds: 'out_of_bounds',
      flew_away: 'flew_away', stuck: 'stuck', empty: 'empty', timeout: 'timeout',
      /* 新的一种失败：车一直在动，但一直在原地打转 / 慢慢溜，
       * 永远到不了终点。玩家看到的是"我明明在动啊" —— 所以文案必须
       * 直接说清"离终点越来越远是不行的"，不能只写"卡住了"。 */
      no_progress: 'no_progress'
    })[reason] || reason;
  }

  function resolve(state, reason) {
    if (state.phase === 'resolved') return;
    state.phase = 'resolved';
    if (reason === 'win') {
      state.result = 'win';
      // 三颗星各自独立达成（参考的累计制）：一局只拿到其中一颗是正常玩法，
      // 剩下的靠"换一种造法再跑一次"补上，而不是要求一局全中。
      state.starGoals = {
        arrive: true,
        boxes: state.boxesGot === state.boxes.length,
        challenge: challengePass(state)
      };
      state.stars = (state.starGoals.arrive ? 1 : 0) +
                    (state.starGoals.boxes ? 1 : 0) +
                    (state.starGoals.challenge ? 1 : 0);
      log(state, 'win stars=' + state.stars + ' goals=arrive' +
        (state.starGoals.boxes ? ',boxes' : '') + (state.starGoals.challenge ? ',challenge' : '') +
        ' box=' + state.boxesGot +
        ' energy=' + Math.round(state.car ? state.car.energy : 0) + ' time=' + state.time.toFixed(1));
    } else {
      state.result = 'fail';
      state.failReason = reason;
      // 没到终点 → 这一局一颗星都不进账（星盒和挑战都以"到达"为前提）
      state.starGoals = { arrive: false, boxes: false, challenge: false };
      state.stars = 0;
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
      /* 「限时」——参考里是最常见的第三颗星（秒表图标）。用关卡自己的 timeLimit
       * 之外再给一个更紧的 max，两档时间在参考里就是"疾驶猪"的 A/B 档。 */
      case 'time': return state.time <= (ch.max || 0);
      /* 「不散架 KRAK SNAP」——参考里最经典的那一颗。
       * 判据必须两条都满足：载具本体没散架，并且猪没从载具里掉出来。
       * 只判前者的话，"框好好的、猪却从缺口滑出去了"会被误判成成功；
       * 只判后者的话，"框全碎了但猪还卡在一角"同样不该算。 */
      case 'noBreak': return !state.hullBroken && !state.pigEjected;
      /* 「气球一个都没破」—— 飞行关的第三颗星。
       * 用 balloonPops（含主动扎和碰地扎），因为"自己扎破"和"摔破"对玩家
       * 来说是同一件事：气球没了。要是只判碰地，主动扎光气球反而能拿三星。 */
      case 'noPop': return (state.balloonPops || 0) === 0;
      /* 「沙袋全扔完」—— 配重关的第三颗星：证明玩家真的用掉了配重，
       * 而不是"多带了一堆沙袋一路压过来"。
       * 总数读 state.sandbagTotal（出发那一刻算好的），不再二次遍历 build ——
       * HUD 的"已扔 2 / 3"和这里的判定必须是同一个数，否则玩家会看到
       * "3/3 了但没给星"。 */
      case 'allSandbags':
        return (state.sandbagTotal || 0) > 0 &&
               (state.sandbagsDropped || 0) >= state.sandbagTotal;
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

      /* 浮力：气球每个 lifts `liftMass` kg，等效"少这么多重量"。
       * 注意这里加的是 +G·liftMass（力），不是改 mass ——
       * mass 参与碰撞与惯性，浮力不改变惯性，只抵消重力。
       * 结果是：车轻、气球多 → netMass < 0 → 一直往上飘；
       *          车重、气球少 → netMass > 0 → 只是"变轻了"，照样得靠轮子。
       *
       * 上升速度由 `liftMaxRise` 硬封顶（下面做积分时钳 vy），
       * 而不是靠空气阻力收敛。试过阻力模型：终端速度 =
       * G·(lift−m)/(k·lift)，对"净浮力"极度敏感 —— 挂 6 个气球只有 0.46 m/s
       * （慢到看不出在飞），少挂一个又完全不飞。玩家学不到可预期的规则。
       * 封顶之后规则变成一句话：**能带起来就以 2.5 m/s 匀速上升**，
       * 与挂几个气球无关，只与"带不带得起来"有关。 */
      if (car.liftMass > 0) fy += G * car.liftMass;

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
      /* 上升速度兜底：气球很多时净浮力可能一帧之内跳变（扔沙袋、连扎几个），
       * 不希望出现"一帧跳上去两米"的观感。只压上升，不碰下落。 */
      if (car.vy > Params.liftMaxRise) car.vy = Params.liftMaxRise;
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
      /* 蠕行刹车：慢于 1.5 m/s 且没有动力在输出时，额外阻尼，避免"永远滑一点点"。
       *
       * ⚠ 必须让开斜坡，否则它会吃掉重力。
       * 这条刹车是按比例削速度的（每子步 ×(1 − 2.5·(1−v/1.5)·h)，60Hz 下每秒剩 8%），
       * 而它并不知道"我现在站在坡上"。结果：气球把净重压到 1.8/9.0 kg 时，
       * 沿坡的重力加速度只剩 0.67 m/s²（= 每帧 0.011 m/s），
       * 而刹车每帧抹掉 4% —— 车永远到不了 1.5 m/s，永远被刹车按住，
       * 10 秒只挪 2 米，看起来像"气球让车变傻了"。
       *
       * 正确语义：这条刹车是为了抹掉**平地上**的残余抖动（用户把 groundFriction 定为 0）。
       * 斜坡上重力是真实的驱动力，不该被它抵消 —— 坡度超过 rollResist 就不再施加。 */
      var spNow = Math.hypot(car.vx, car.vy);
      var driving = (car.motor && car.energy > 0) ||
        (car.groups || []).some(function (g) { return g.on; });
      var onSlope = Math.abs(ter.surfaceSlope(car.x)) > Params.creepMinSlope;
      if (!driving && !onSlope && spNow < 1.5) {
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

    /* 气球碰地 = 扎破（参考的行为：碰到墙/地自动破）。
     * 这条不是"惩罚"而是"节奏"：气球让车飞起来，但一旦落地就全泄了 ——
     * 所以玩家必须在飞的时候想清楚"现在还要不要这么多气球"。
     * 判定用气球球心低于地表（不是车体）：车翻滚时气球可能先着地。 */
    var balloons = car.parts.filter(function (p) { return p.def.liftMass && (p.n || 0) > 0; });
    for (var bi2 = 0; bi2 < balloons.length; bi2++) {
      var bp = worldOf(car, balloons[bi2].lx, balloons[bi2].ly);
      if (bp.y - 0.3 <= ter.surfaceY(bp.x)) {
        /* 这里原来写的是 `state.car.balloonPopsBurst`（读车）却写 `state.balloonPopsBurst`
         * （写状态）—— 读的那一边永远是 undefined → `before` 恒为 0 → 碰地破 6 个
         * 也只记成 1 个。HUD 的「已扎 N 个」就是读这个字段，于是一路显示 1。
         * 计数器和它自己被读的地方必须同一个对象。 */
        var before = state.balloonPopsBurst || 0;
        /* spawnBurst 由 popBalloon 自己发（主动扎和碰地扎共用一条事件），
         * 这里再发一次就会在同一帧写两条 burst，渲染层炸两遍。 */
        if (popBalloon(state, balloons[bi2])) {
          state.balloonPopsBurst = before + 1;
        }
        break;                 // 一帧最多破一个，免得一次全破光（那是"失败"不是"反馈"）
      }
    }

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
    /* 「到终点」必须同时满足"横向到了"和"人在这儿"。
     *
     * 只判 x 的话，气球流玩法会当场塌掉：车一直往上飘、vx 还有 2 m/s，
     * 于是"什么都不做"也能飘过终点线 —— 实测 maxY=19.9 判 win。
     * 那样这关教的就是"挂气球然后挂机"，而不是"扔沙袋起飞、扎气球落地"。
     *
     * 所以加一条高度门槛：到终点那一格时，车必须在终点地表 3 米以内。
     * 3 米是从"最矮的木头轮车壳高度 1 米 + 一个气球直径"量出来的：
     * 正常贴地滚过、轻跳着过都算到，只有真的在天上飞才不算。 */
    /* 「到终点」= **在终点的高度上**越过了终点线。
     *
     * 只判 x 的话，气球流玩法会当场塌掉：车一直往上飘、vx 还有 2 m/s，
     * 于是"什么都不做"也能飘过终点线 —— 实测 maxY=19.9 判 win。
     * 那样这关教的就是"挂气球然后挂机"，而不是"扔沙袋起飞、扎气球落地"。
     *
     * 只判"离地高度"也不行：车飞过旗子之后才落下来，落地时 x 早就越过终点，
     * 于是"飞过去再摔在后面"照样判 win（实测在终点线上空 8 米掠过，2.7 秒后判赢）。
     *
     * 正确语义：车必须**落在终点那一格的地面上** ——
     * 即 x 越过终点线，且车身高度和终点地表的高度差在一个车壳以内。
     * 这个差值对任何关卡都成立（车静止时车心离地恒定约 1.8 米），
     * 所以它是"车停在终点地上"，不是"车飞过终点上空"。 */
    if (car.x >= state.level.goal.col) {
      var goalAlt = Math.abs(car.y - ter.surfaceY(car.x));
      if (goalAlt <= Params.goalMaxAlt) { resolve(state, 'win'); return; }
      if (!state.overGoalLogged) {
        state.overGoalLogged = true;
        /* 记下"第一次发现飞过终点"的时刻，HUD 要拿它弹一条提示。
         * 没有这条提示，玩家看到的是：明明从旗子上空飞过去了，却没赢，
         * 而且连一句解释都没有 —— 会以为是自己没到。 */
        state.overGoalAt = state.time;
        log(state, 'over_goal alt=' + goalAlt.toFixed(1));
      }
    }
    if (car.y < -2 || car.x < -2 || car.x > ter.cols + 2) { resolve(state, 'out_of_bounds'); return; }
    /* 天花板：气球把车顶到天上去了。
     * 没有这条的话，"只挂气球不装轮子"这种造法永远不会结算 ——
     * 车以 2.5 m/s 匀速上升，8 秒后已经在地图上方 20 米，
     * 而失败判定只看 x/y 下界，于是这一局会一直 running。
     * 有天花板之后，气球从"能飞"变成"有代价地飞"，这才是个决定。 */
    if (car.y > ter.rows + 6) { resolve(state, 'flew_away'); return; }
    state.maxAngle = Math.max(state.maxAngle || 0, Math.abs(car.a));
    var sp2 = Math.hypot(car.vx, car.vy);
    if (sp2 < 0.2) {
      state.stuckTimer += dt;
      if (state.stuckTimer > 5) { resolve(state, 'stuck'); return; }
    } else state.stuckTimer = 0;

    /* 「没有进展」看门狗 —— 详细论证见 Params.progressWindow。
     *
     * 一句话：W 秒内既没有更靠近终点 D 米，也没有升高 D 米，就判没戏。
     * 这比 stuck 宽容（车可以一直在动），但比 60 秒硬上限严厉得多 ——
     * 它救的正是"以 0.2 m/s 慢慢溜、永远爬不上墙、也不肯停下来"那一类局。
     *
     * 实现：一条只保留 W 秒的滚动历史。每帧问一句"窗口内达标了吗"，
     * 达标就把 progLastGainT 刷新成现在 —— 于是
     *   noGainFor = now - progLastGainT
     * 正好就是"这个条件已经多久没成立了"。HUD 要用同一个数显示倒计时警告，
     * 所以它必须算在引擎里、而不是在渲染层再推一遍（同一事实只能有一份）。 */
    var hist = state.progHist;
    var left = state.level.goal.col - car.x;
    hist.push({ t: state.time, left: left, y: car.y });
    while (hist.length > 2 && hist[0].t < state.time - Params.progressWindow - 0.1) hist.shift();
    var h0 = hist[0];
    if (h0 && state.time - h0.t >= Params.progressWindow - 1e-6) {
      var gainLeft = h0.left - left;          // 距终点缩小了多少米
      var gainY = car.y - h0.y;               // 升高了多少米
      if (gainLeft >= Params.progressGain || gainY >= Params.progressGain) {
        state.progLastGainT = state.time;
      }
    }
    state.noGainFor = state.time - (state.progLastGainT || 0);
    if (state.noGainFor >= Params.progressWindow) { resolve(state, 'no_progress'); return; }
    if (state.time > Params.demoTimeLimit) { resolve(state, 'timeout'); return; }

    // 回放缓冲（3 秒）
    if (state.replay.length === 0 || state.time - state.replay[state.replay.length - 1].t > 1 / 20) {
      state.replay.push({ t: state.time, x: car.x, y: car.y, a: car.a });
      while (state.replay.length > 60) state.replay.shift();
    }
  }

  // ---------------- 测试脚手架：不开浏览器也能跑一局 ----------------
  /* SPECS 里除了零件摆位，还可以带两类元数据（都以 _ 开头，applySpec 会跳过）：
   *   _dirs   : { pump: 0 } —— 打气筒朝向，0=右 1=上 2=左 3=下
   *   _presses: [{t:0.8,k:'press'},{t:1.5,k:'release'}] —— 运行期按下/松开的时刻
   * 1-2 从"按不按都行"改成"必须按一下"之后，标准解就不再是一组摆位了，
   * 它必须包含"什么时候按" —— 否则任何一条用 SPECS 自动跑关的测试都会误判失败。 */
  var SPECS = {
    // 每关的标准解（与 tests/cases.md 的点击序列一致）
    '1-1': { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]] },
    '1-2': { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pump: [[3, 2]], pig: [[4, 2]],
             _dirs: { pump: 0 },                                  // 打气筒朝右
             _presses: [{ t: 0.8, k: 'press' }, { t: 1.5, k: 'release' }] },
    '1-3': { wood_frame: [[4, 1], [4, 2], [4, 3], [4, 4]], wood_wheel: [[5, 1], [5, 4]], motor: [[4, 0]], battery: [[4, 3]], pig: [[4, 2]] },
    '1-4i': { wood_frame: [[4, 1], [4, 2], [4, 3], [4, 4]], iron_wheel: [[5, 1], [5, 4]], motor: [[4, 0]], battery: [[4, 3]], pig: [[4, 2]] },
    '1-4w': { wood_frame: [[4, 1], [4, 2], [4, 3], [4, 4]], wood_wheel: [[5, 1], [5, 4]], motor: [[4, 0]], battery: [[4, 3]], pig: [[4, 2]] },
    '1-5m': { wood_frame: [[4, 0], [4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 0], [5, 3]], motor: [[4, 4]], pig: [[4, 1]] },
    '1-5n': { wood_frame: [[4, 0], [4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 0], [5, 3]], pig: [[4, 1]] },
    /* 1-6 的标准解不只是摆位，还包含两个"什么时候动手"的时刻：
     *   扔沙袋 @3.0s —— 沙袋是起飞开关，早扔会飘、晚扔冲进沟
     *   扎 1 个 @7.0s —— 扎太多会砸下去，一个才够把"上升"变成"缓降"
     * 这两个动作必须走和玩家点击同一条代码路径（dropSandbag / popBalloon），
     * 否则测试通过而实际玩不通。 */
    '1-6': { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]],
             balloon: [[3, 1], [3, 2]], sandbag: [[5, 2]], pig: [[4, 2]],
             _stacks: { balloon: 3, sandbag: 3 },
             _drops: [{ t: 4.5, n: 3 }],
             _pops: [{ t: 8.0, n: 1 }] }
  };

  function applySpec(level, build, spec) {
    Object.keys(spec).forEach(function (part) {
      if (part.charAt(0) === '_') return;                 // 元数据不是零件
      spec[part].forEach(function (rc) {
        tryPlace(level, build, part, rc[0], rc[1]);
      });
    });
    /* 可叠零件（气球/沙袋）的摆放位置只能表达"放哪几个格子"，
     * 表达不了"每格几个"。再点同一格 n−1 次才是真的堆上去，
     * 而且必须走 tryPlace —— 直接写 cell.n 会绕过预算检查。 */
    var stacks = spec._stacks || {};
    Object.keys(stacks).forEach(function (part) {
      (spec[part] || []).forEach(function (rc) {
        var want = stacks[part] || 1;
        for (var k = 1; k < want; k++) {
          var res = tryPlace(level, build, part, rc[0], rc[1]);
          if (!res.ok || res.n === undefined) break;
        }
      });
    });
    return build;
  }

  /* 把一个 spec 的元数据（朝向、按下时刻）装到一局运行上。
   * 浏览器里由玩家按键，Node 里由 simulate 调 —— 两条路径共用这一份，
   * 免得测试通过而实际玩不通（或反过来）。 */
  function applySpecRuntime(state, spec) {
    if (!spec) return state;
    var dirs = spec._dirs || {};
    Object.keys(dirs).forEach(function (partKey) {
      var def = PARTS[partKey];
      state.car.parts.forEach(function (p) { if (p.def === def) p.dir = dirs[partKey]; });
    });
    return state;
  }

  function simulate(level, spec, opts) {
    opts = opts || {};
    resetParams(opts.params);
    var build = newBuild();
    applySpec(level, build, spec);
    var state = createRun(level, build);
    applySpecRuntime(state, spec);
    var dt = 1 / 60;
    var maxT = opts.maxTime || 70;
    /* 三类运行期动作统一成一条时间轴：
     *   press/release —— 交互件（打气筒）的按下与松开
     *   drop          —— 扔一个沙袋
     *   pop           —— 扎一个气球
     * 后两类走的是和玩家点车身完全相同的 dropSandbag / popBalloon，
     * 不是伪造状态（伪造状态会让测试绿而实机红）。 */
    var acts = [];
    ((spec && spec._presses) || opts.presses || []).forEach(function (a) {
      acts.push({ t: a.t, k: a.k || 'press' });
    });
    ((spec && spec._drops) || []).forEach(function (a) {
      for (var i = 0; i < (a.n || 1); i++) acts.push({ t: a.t + i * 0.016, k: 'drop' });
    });
    ((spec && spec._pops) || []).forEach(function (a) {
      for (var i = 0; i < (a.n || 1); i++) acts.push({ t: a.t + i * 0.016, k: 'pop' });
    });
    acts.sort(function (a, b) { return a.t - b.t; });
    var ai = 0;
    while (state.phase === 'run' && state.time < maxT) {
      while (ai < acts.length && acts[ai].t <= state.time) {
        if (acts[ai].k === 'drop') dropSandbag(state);
        else if (acts[ai].k === 'pop') popBalloon(state);
        else if (acts[ai].k === 'press') pressInteract(state, 1);
        else releaseInteract(state, 1);
        ai++;
      }
      step(state, dt);
    }
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
    dropHistory: dropHistory, pushHistory: pushHistory, rotateAt: rotateAt, clearBuild: clearBuild, budgetLeft: budgetLeft,
    interactiveCount: interactiveCount, buildVehicle: buildVehicle,
    createRun: createRun, step: step, stepLoose: stepLoose, damageCar: damageCar, setBrake: setBrake, pressInteract: pressInteract,
    pressInteract: pressInteract,
    releaseInteract: releaseInteract, challengePass: challengePass,
    popBalloon: popBalloon, dropSandbag: dropSandbag, tapAt: tapAt, syncCarMass: syncCarMass,
    recomputeLift: recomputeLift, cellCount: cellCount,
    SPECS: SPECS, applySpec: applySpec, applySpecRuntime: applySpecRuntime,
    simulate: simulate, partPos: partPos
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RAP;
  else root.RAP = RAP;
})(typeof globalThis !== 'undefined' ? globalThis : this);

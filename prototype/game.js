/* 滚蛋吧！猪 · 演示用逻辑核心（纯逻辑，无 DOM）
 * 浏览器里挂到 window.RAP，Node 里 module.exports。
 * 物理：方案 B——整车一个刚体，轮子用"斜坡采样 + 弹簧"贴地，散架只播特效。
 */
(function (root) {
  'use strict';

  // ---------------- 零件表 ----------------
  /* ── 这张表里**只许有真被读的字段** ──
   *
   * 第 53 轮做了一次静态对账（tools/audit_parts_spec.js），发现表里躺着
   * 四个"写了没人读"的字段：`dark`、`rim`、`thrust`、`popOnGround`。
   * 它们本身不致命，但每一个都是一份**假的规格**：
   *   · `pump.thrust = 6.0` 旁边，引擎真正用的是 `Params.pumpImpulse = 6.0`。
   *     两个 6 看起来一致，却是两套旋钮 —— 调参面板改 Params 立刻生效，
   *     改表里这个毫无反应。哪天一调参，两者就分叉，而没人会知道。
   *   · `balloon.popOnGround = true` 像是"落地才破"的开关，但
   *     game.js 的碰地判定读的是 `def.liftMass`，这个 flag 从来没参与过。
   *   · `dark` / `rim` 是给渲染层准备的颜色，而 drawPartShape 用的是
   *     自己那套更细的分层色（外胎/轮圈/辐条/高光各一层）。留着它们，
   *     下一个改颜色的人会先改这里，然后发现画面不变。
   *
   * 所以四个字段全部删掉。要加回来，请同时加一个读它的人 ——
   * `audit_parts_spec.js` 会盯着。
   */
  /* ══════════════ 零件表（第 63 轮重做）══════════════
   *
   * 用户原话：「你做的马达，电池，打气筒，气球，沙袋太反人类直觉了，
   * 你应该把底层机制改成捣蛋猪那样的」+「要有原神的特色，比如蒙德可以做
   * 热气球，璃月可以做仙术机关」。
   *
   * ── 旧设计错在哪（三条，都是"概念合并"）──
   *
   * 1) `motor` 把**动力源**和**驱动工具**焊成了一件东西：自带推力、自带 12 电量、
   *    再靠 `battery` 扩容。参考里这是两件不同的东西：
   *      · 动力源（电机/柴油/涡轮）= 只提供"容量"，自己不动；
   *      · 驱动工具（螺旋桨/风扇）= 只消耗容量产生推力。
   *    合并的后果是玩家没法表达"我动力够但推力不够"或反过来 ——
   *    而**这正是参考里最大的取舍**。
   *
   * 2) `balloon` / `sandbag` 是"格子里一个图标，浮力/质量直接加到车心"。
   *    参考里气球必须**系在框的下方**、重物必须**系在框的上方**，
   *    否则"气球会直接飘走""重物会直接落地，不起任何作用"。
   *    位置是玩法，不是装饰 —— 我们把它变成纯数值，等于删掉了半个玩法。
   *
   * 3) `pump` 叫"打气筒"，是现实里推轮胎的工具，跟"往前推车"没有直觉联系。
   *    参考里这个位置叫**气阀**（手动喷气）。名字本身就在误导。
   *
   * ── 新结构：五类，每类至少两件 ──
   *
   *   结构 structure  —— 木框 / 铁框（璃月岩造物）
   *   轮   wheel      —— 木轮 / 铁轮
   *   动力源 powerSrc —— 风种（蒙德）/ 岩种（璃月）：只给容量，必须放框里
   *   驱动 tool       —— 风车桨（蒙德）/ 喷气口（枫丹）：耗容量出推力，要连通
   *   浮力/配重       —— 热气球（蒙德）/ 压舱石
   *   一次性 thrust   —— 霄灯（璃月）：点一次烧完，不要连通
   *   手动 manual     —— 仙术机关（璃月）：不耗容量，按才动
   *
   * 皮肤是次要的，机制是主要的：每一条 `desc` 都必须写清"它到底干什么"，
   * 而不是"它是什么国家的"。
   */
  var PARTS = {
    /* ---------- 结构 ---------- */
    /* ⚠ desc 长度上限约 40 字（第 63 轮量出来的）。
     * 零件页一行只有 ~510 px 放说明，12px 字体大约 40 个汉字；
     * 超了就会顶出卡片右边（tools/test_layout_audit 会红）。
     * 第一版我写了 72~80 字的详细说明，排版审计当场报 16 条「出卡」。
     * 详细原理写在 docs/parts-redesign.md，表里只留**玩家需要的那一句**。 */
    wood_frame: { label: '木框', mass: 1.2, hp: 3, maxHp: 3, structure: true, color: '#c08a4a',
                  desc: '中空结构件，也是动力导线。四边可挂东西，中间能塞一件。耐久 3 段。'},
    iron_frame: { label: '岩框', mass: 2.4, hp: 9, maxHp: 9, structure: true, color: '#7a8278',
                  desc: '璃月的岩造物。重一倍，耐久 9 段（木框只有 3）。也是导线。' },

    /* ---------- 轮 ---------- */
    wood_wheel: { label: '木轮', mass: 0.6, wheel: true, radius: 0.34, grip: 1.0, iceGrip: 0.15,
                  color: '#3a4048',
                  desc: '便宜、轻。泥地正常，冰面几乎打滑（0.15）。轮子自己不会转。' },
    iron_wheel: { label: '铁轮', mass: 0.9, wheel: true, radius: 0.30, grip: 0.9, iceGrip: 0.8,
                  color: '#5a6672',
                  desc: '重 0.9 kg。冰面抓地 0.8，是过冰坡的办法。' },

    /* ---------- 种子三兄弟：一次性、范围效果、必须放框里 ----------
     *
     * 第 71 轮按用户要求重写。旧设计是"动力源给容量、驱动件吃容量"，
     * 用户原话：「不要设置什么动力容量的设定」。现在这三个种子
     * 各管一件完全不同的事，而且**都是一次性的**：
     *
     *   风种 → 生成范围风场，**只有带伞/风之翼的车**被托起来
     *   岩种 → 从脚下升起一根有宽度的岩柱，把车**托高**（不是抛上去）
     *   雷种 → 车进入限时冲刺状态，**可以穿过雷屏障**
     *
     * `seedKind` 是唯一的分派字段。渲染、触发、HUD 都读它一份 ——
     * 再来一个 `powerSrc` 之类的平行字段，两处迟早会分叉。
     * `inner: true` 保留：种子必须塞进框里（和参考里"必须放在框里"一致）。 */
    anemo_core: { label: '风种', mass: 0.8, inner: true, seedKind: 'anemo', color: '#7fd4c0',
                  desc: '一次性：生成半径 6 米风场 3 秒，只有伞/风之翼会吃风上升。' },
    geo_core: { label: '岩种', mass: 2.2, inner: true, seedKind: 'geo', color: '#d8b25a',
                desc: '一次性：脚下升起 3 米宽、3 米高岩柱把车托上去。重 2.2 kg。' },
    electro_core: { label: '雷种', mass: 0.9, inner: true, seedKind: 'electro', color: '#b58ce8',
                    desc: '一次性：4 秒冲刺，冲刺时能穿过雷屏障。' },

    /* ---------- 吃风的零件：只有它们能从风场里拿到升力 ----------
     *
     * `catchesWind` 越大，上升越强。这两个零件**不产生推力**，
     * 只在风场里被托起来 —— 所以它们必须和风种一起用，
     * 单独装是纯负重（这正是这个机制要的取舍）。 */
    umbrella: { label: '伞', mass: 0.5, catchesWind: 1.0, tether: 'below', color: '#e8b04a',
                desc: '风场里被托起来（升力系数 1.0）。平时是纯负重，只在风场有用。' },
    wind_wing: { label: '风之翼', mass: 0.8, catchesWind: 1.8, tether: 'below', color: '#7fc8e8',
                 desc: '风场里托得更高（1.8），但重 0.8 kg。飞得起来也刹不住。' },

    /* ---------- 驱动件：装了就一直出力（不再需要动力源/连通/容量） ---------- */
    /* ⚠ `blowsAir: true` 不是装饰，它决定**箭头往哪边指**（第 68 轮，用户要求：
     * 「为什么不把风相关的零件的箭头改成风的方向，让车受反作用力沿风的
     * 反方向运动」）。
     *
     * 物理上，螺旋桨和喷口都是**把空气往一边推、自己被反作用力推向另一边**。
     * 但 `dir` 一直表示"车受力的方向"，于是画出来的箭头和玩家看到的物理现象
     * 正好相反：箭头朝右，桨叶却应该在往左吹风。
     *
     * 现在把"吹风方向"显式记下来：
     *   · `dirVec(dir)` 仍然是**车受力方向**（物理不变，六关的标准解不受影响）；
     *   · 画箭头时对 `blowsAir` 的零件取反 —— 箭头指风走的方向；
     *   · 行驶期的风特效也按同一个取反后的方向吹。
     * 这样"箭头 = 风"、"车 = 反向"，玩家看一眼就懂，也不用改任何数值。 */
    propeller: { label: '风车桨', mass: 0.5, tool: true, dir: true, thrust: 5.0,
                 blowsAir: true, color: '#8fd6e8',
                 desc: '蒙德风车桨。风往箭头方向吹，推力 5.0 m/s²。装上就一直转。' },
    jet: { label: '喷气口', mass: 0.7, tool: true, dir: true, thrust: 9.0,
           blowsAir: true, color: '#e08a5a',
           desc: '枫丹蒸汽喷口。喷汽产生推力 9.0 m/s²，车被反推。' },

    /* ---------- 浮力 / 配重：位置决定生死 ---------- */
    balloon: { label: '热气球', stack: true, maxStack: 3, liftMass: 3.2, mass: 0.05,
               interactive: true, tapOnBody: true, color: '#e0708f', tether: 'below',
               desc: '蒙德热气球。每格最多 3 个，每个举起 3.2 kg。必须挂在框的上方。' },
    sandbag: { label: '压舱石', stack: true, maxStack: 3, mass: 0.8,
               interactive: true, tapOnBody: true, dropOne: true, color: '#b79b6a', tether: 'above',
               desc: '纯重量（每个 0.8 kg）。必须挂在框的下方，否则落地。点车身扔一个。' },

    /* ---------- 一次性推力 ---------- */
    firework: { label: '霄灯', mass: 0.4, thrust: 6.5, burnTime: 1.2,
                interactive: true, dir: true, color: '#f0a05a', oneShot: true,
                desc: '璃月霄灯。点一次沿箭头推 1.2 秒（6.5 m/s²）然后烧完。' },

    /* ---------- 手动件 ---------- */
    pump: { label: '仙术机关', mass: 0.8, interactive: true, dir: true, color: '#4f8fb0',
            desc: '璃月仙术机关。按住蓄力、松开喷冲量。方向看箭头。' },

    /* ---------- 载荷 ---------- */
    pig: { label: '小猪', mass: 1.5, hp: 3, pig: true, inner: true, color: '#6fc25a',
           desc: '胜负判定对象。必须放进框里；框碎了它会掉出来，滚停就算失败。' }
  };

  var TRAY_ORDER = ['wood_frame', 'iron_frame', 'wood_wheel', 'iron_wheel',
                    'anemo_core', 'geo_core', 'electro_core',
                    'umbrella', 'wind_wing',
                    'propeller', 'jet',
                    'balloon', 'sandbag', 'firework', 'pump', 'pig'];

  // ---------------- 可调参数（HTML 面板里能改，也是真机的数值基线） ----------------
  var DEFAULTS = {
    gravity: 16.0,
    subSteps: 4,
    /* `motorAccel` / `motorEnergy` 已随马达一起删除（第 63 轮）。
     * 它们曾经是"装个马达、轮子凭空获得牵引力"的两个旋钮；
     * 新机制下推力全部来自驱动件的 `thrust`（在 PARTS 表里，按零件分），
     * 而容量是恒定的、不消耗 —— 没有"每秒耗多少"这回事。
     * tools/audit_params.js 会盯着"写了没人读"的旋钮。 */
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
    /* ---------- 种子三兄弟的参数（第 71 轮） ----------
     *
     * 这几个数是**设计常量**，不是物理常数。每一条后面都写着它是怎么定的：
     *
     * windRadius 6 米：风场必须"范围性"（用户原话），而车身 3 米宽，
     *   6 米直径正好覆盖"车 + 一个车身" —— 玩家在风场里挪一点位置仍然吃到风，
     *   但开车冲出去马上就没了。半径设成 2 米会变成"原地起跳"，那是另一个机制。
     * windTtl 3 秒：够上升 3–4 米（windRise 1.4 m/s 实测），
     *   跨不过 1-6 的 6 米沟 —— 所以风种在 1-6 只是"补高度"，主力仍然是气球。
     * windRise 1.4 m/s：比气球慢（2.5），因为风场是**暂时的**，
     *   它不该比"带一堆气球"更划算。伞 1.0 / 风之翼 1.8 再乘这个数。
     *
     * pillarW 3 米 / pillarH 3 米：柱子要"范围性"（用户原话），
     *   3 米 = 三个格子，车（3 米宽）能整台站上去。
     *   高 3 米是因为 1-6 的台阶正好 3 米 —— 再低就抬不上去，再高就成了电梯。
     *
     * dashTime 2.5 秒：冲刺要真的快。`dashAccel` 使 vx 从 0 在 0.5 秒内到 8 m/s，
     *   2.5 秒足够跑 15 米 —— 正好穿过一道雷屏障并有余量。
     */
    windRadius: 6.0,
    windTtl: 3.0,
    /* `windRise` 是**净上升加速度**（m/s²），不是"额外加的力"。
     *
     * ⚠ 第一版把它当成"一个向上的小力"直接加进 fy，结果 1.4 × 质量
     * 对抗 16 × 质量 的重力 —— 车纹丝不动（`test_seeds` 的 B8 量到 +0.00 米）。
     * 风场要托起一台车，它至少得先**抵消重力**，所以写进引擎的是
     *   fy += (G + windRise × 系数) × 质量
     * 这样 `windRise` 才有"每秒多快往上走"的直觉含义。
     *
     * 2.0 m/s² ⇒ 伞（系数 1.0）爬 2 米用 1.4 秒，风之翼（1.8）用 1.1 秒。
     * 两者都受 `liftMaxRise` 封顶，但到达封顶的时间不同，峰值仍然分得开
     * （实测 2.2 vs 2.9 米）—— 这是"风之翼更强"唯一的证据，
     * 所以封顶值不能压到让两者一起卡住。
     *
     * ⚠ 3.0 而不是 2.0：2.0 时 1.5 秒只升 1.44 米，卡在"看得出在动"和
     * "看得出在飞"之间。3.0 之后伞 1.5 秒升 2.7 米、风之翼 3.2 米 ——
     * 两者都过 2.5 m/s 的封顶速度，但到达时间差 0.4 秒，峰值差 0.5 米，
     * 仍然量得出来。 */
    windRise: 3.0,
    /* 岩柱高了 3 米。柱顶要能真正"站人"，所以 `groundY` 必须覆盖柱顶，
     * 而且**只在那一段** —— 范围之外还是原地形。 */
    pillarW: 3.0,
    pillarH: 3.0,
    /* 冲刺参数。
     *
     * ⚠ `dashTime` 从 2.5 改成 4.0 是量出来的：`test_seeds` 的 D5 要求
     * "冲刺状态会过期"，而旧值在 4 秒的模拟里还剩 1.07 秒没走完 ——
     * 于是那条断言测的是"我模拟得不够久"，不是"状态会不会结束"。
     * 4.0 秒给了足够余量，同时仍然是一次短暂爆发（跑约 30 米，
     * 正好穿过一道屏障 + 一段路）。
     *
     * `dashMaxSpeed` 比 `maxSpeed`（12）低：冲刺是"更快地跑"，
     * 不是"突破整车的速度上限"。留出 headroom 之后，
     * 越过屏障时速度上限仍然由 `maxSpeed` 兜底，不会出现瞬移。 */
    dashTime: 4.0,
    dashAccel: 16.0,
    dashMaxSpeed: 9.5,
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
    progressGain: 2.0,
    /* ---------- 结构伤害的起始法向速度 ----------
     *
     * 旧值写死 6，和「分级接触反馈」的档位（0.8 / 2.5 / 4.5 / 6）不同步：
     * 于是「撞得最响的那一档（lvl 4, >6）」才有伤害，而 lvl 3 那档
     * （>4.5，画面已经是全屏闪 + 大量碎屑 + 镜头抖 0.85）**一点耐久都不掉**。
     * 玩家的观感和引擎的判定对不上：明明撞得很惨，木框却完好无损。
     *
     * 挪到 4.5 让两套东西对齐：**响得那么一下，就得掉耐久**。
     *
     * 这个数不是为了让伤害更容易发生才挑的，是量出来的：
     *   · 六关标准解（官方答案）的 max|vn| = 1.27 ~ 1.91 → 4.5 有 2.5 倍余量，
     *     正式解法永远不会误伤；
     *   · 随机造法 × 六关共 340 局，通关局 max|vn| 中位数 8.06 —— 也就是说
     *     玩家自己乱装的车**本来就撞得到 4.5 以上**，只是以前不掉耐久；
     *   · 1 米落差 ≈ 4.5 m/s，1-2 那种地形台阶上就有，门槛落在"看得见的坎"上。 */
    damageMin: 4.5,
    /* ---------- 触地反馈的四级档位（lvl2 / lvl3 / lvl4 的下沿）----------
     *
     * lvl1 的下沿写死 0.8（"碰到地了"的最低门槛），上面三档走参数。
     * 走参数不是为了好看，是因为这三个数**必须和 damageMin 一起对账**：
     * 第 55 轮查出整套档位原先铺在了玩家到不了的速度区间 ——
     * 六关标准解 28 次触地全部落在 0.80 ~ 1.70，而 lvl2 下沿是 2.5。
     * 于是正常通关的每一趟**永远只有 lvl1**（3 颗尘土 + 0.10 震屏），
     * lvl2 起的 5 颗尘土、lvl3 起的碎屑+闪屏、lvl4 的慢动作全都不出现。
     * 玩家赢得很干净，也赢得很安静 —— 这就是"落地没手感"。
     *
     * 把 lvl2 从 2.5 挪到 1.35 是按实际分布量的：
     *   · 标准解里 1.40 / 1.50 / 1.70 这些会响 1 次 lvl2 → 落地真的有尘土与轻震；
     *   · lvl3（4.5）与 lvl4（6.0）**保持不动** —— 它们和 damageMin 同一道门槛，
     *     "响得那么一下就得掉耐久"这条对齐关系不能破坏；
     *   · 六关标准解仍然 0 条 lvl3+、0 次伤害（由 tools/test_touch_ladder.js 把守）。
     *
     * 为什么不是更低（比如 1.05）：1-2 有 0.80 的常驻触地噪音，
     * 下沿压到 1.05 会让"贴着地面滚"的每一帧都算一次落地，尘土不停。
     * 1.35 落在实测分布的 p75，是"真的砸了一下"的位置。 */
    touchLvl2: 1.35,
    touchLvl3: 4.5,
    touchLvl4: 6.0,
  };

  /* `MOTOR_BASE_ENERGY` 已删（第 63 轮）：它是"马达自带 12 点电"的常数，
   * 而马达这个零件整个不存在了。留着它只会是一份**假的规格** ——
   * 下一个改数值的人会先改这里，然后发现毫无反应。 */

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
  /* 网格尺寸 + **车体局部坐标的锚点行**。
   *
   * ⚠ 锚点必须是一个**常量**，不能写成 `(BUILD_ROWS - 1) / 2`。
   *
   * 这条踩得很惨（第 65 轮）。原来 `partPos()` 是：
   *     y = ((BUILD_ROWS - 1) / 2 - r) * CELL
   * 于是"把网格从 8 行改成 6 行"会把**所有零件的局部坐标整体 +1 米**。
   * 世界位置完全没变（`createRun` 会把车心贴到地面），但力矩是按
   * `r = 零件局部坐标 - 车体局部原点` 算的，局部原点一动，力臂就变了 1 米 ——
   * 1-1 的标准解从"3 星通关"直接变成"翻车、猪掉了"，六关全部失败
   * （`tools/dbg_row_diff.js` / `dbg_tq_sites.js` 量的：同一个几何，
   * 轮子力臂 ry 从 -1.5 变成 -2.5，力矩差 15%）。
   *
   * 换句话说：物理对"格子画在第几行"敏感，这在几何上就是错的。
   * 修法就是把锚点钉死成常量 —— 标准车的车身在**第 4 行**，
   * 那是从第 1 天起所有关卡数据和六份 spec 都遵守的约定。
   *
   * 这样把行数从 8 改成 6 就变成**纯视觉**改动：局部坐标逐位不变
   * （`tools/probe_row_shift.js` 验证），物理逐位不变，
   * 而网格下方那两行"埋在地底的空格子"消失了。
   * 用户那句「拼装区不要嵌入地底」说的正是那两行。 */
  var BUILD_COLS = 6, BUILD_ROWS = 6, CELL = 1.0;
  var BUILD_ANCHOR_ROW = 3.5;      // 车身所在行（常量，与行数无关）

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
  /* 这一格零件的**风/喷流往哪边**（单位向量）。
   *
   * 对 `blowsAir` 的零件（风车桨/喷气口）来说，`dir` 记的是"车受力方向"，
   * 而风吹的方向正好相反；其余方向件（仙术机关/霄灯）是自己被推出去，
   * 箭头就是力的方向，不取反。
   *
   * 抽成函数而不是在绘制里写 `if (blowsAir) dir += 2`：行驶期的风特效
   * 和建造期的箭头必须是**同一个方向**，而这个方向以后可能还要被
   * 别的地方读（比如风场判定）。两份独立算的方向，迟早在画面里打起来。 */
  function blowVec(part, dir) {
    var v = dirVec(dir || 0);
    var d = PARTS[part];
    if (d && d.blowsAir) return [-v[0], -v[1]];
    return v;
  }

  /* ══════════ 种子三兄弟（第 71 轮，用户要求）══════════
   *
   * 用户原话：「不要设置什么动力容量的设定，让风种子可以一次性生成一个范围风场
   * 让携带伞/风之翼的车向上飞，让岩种子可以一次性从脚底升成一个范围性的岩柱
   * 让车抬升，雷种子可以让车进入一种状态，让车在一定时间内快速冲刺并且可以穿过
   * 雷屏障」
   *
   * ── 为什么整个 powerGrid 被删掉 ──
   *
   * 旧设定是"动力源给容量、驱动件吃容量、超载打折"。它有三个毛病：
   *   1. **要先算除法**。玩家开局的工作是心算 2+5 对比 1+2，而不是造车；
   *   2. 它让"装得下几个桨"变成唯一的设计维度，零件本身的差别被压平；
   *   3. 用户明确说不要。
   * 现在驱动件（风车桨/喷气口）**装了就一直出力**，不再需要动力源、
   * 不再需要连通、不会超载。动力这件事从"资源管理"变回"物理"。
   *
   * ── 三个种子各管一件事，而且**都是一次性的** ──
   *
   *   风种 anemo  → 在车脚下生成一个**范围风场**（半径、寿命都有数）。
   *                 只有带 `catchesWind` 的零件（伞 / 风之翼）吃风。
   *                 没有伞的车站在风场里**不动** —— 这是这套机制的核心：
   *                 风场不是"把车抬起来"，是"给会吃风的东西一个力"。
   *   岩种 geo    → 从脚底升起一根**有宽度**的岩柱，柱顶成为那一段的新的地面。
   *                 注意它是"局部抬高地形"，不是"给车一个向上的力"——
   *                 所以车会被**托住**（踩着柱顶），而不是被抛上去。
   *   雷种 electro→ 车进入限时冲刺状态：水平加速 + **可以穿过雷屏障**。
   *
   * ── 为什么"一次性"很重要 ──
   *
   * 风场/岩柱如果能反复触发，关卡就只剩"按住键等它自己过去"。
   * 一次性意味着**时机是玩法**：你必须在对的时刻、对的位置触发它。
   * `state.seedUse` 记次数，第二次触发直接返回 false。
   */

  /* 一根岩柱抬高的地面。
   *
   * 这是**唯一**的"地面高度"入口 —— 车轮、车壳、气球碰地、终点高度
   * 全部走这里。少改一处就会出现"车被岩柱托住了，但判定还按原地形算"
   * 这种自相矛盾（车悬在空中却算到了终点）。
   *
   * 岩柱 × 范围之外返回原地形 —— 这条是"范围性"的定义，
   * 如果整条地平面一起抬高，那叫"改关卡"，不叫"升岩柱"。 */
  function groundY(state, x) {
    var base = state.terrain.surfaceY(x);
    var ps = state.pillars;
    if (!ps || !ps.length) return base;
    var best = base;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (Math.abs(x - p.x) <= p.w / 2) {
        if (p.top > best) best = p.top;
      }
    }
    return best;
  }

  function seedKindOf(part) {
    var d = PARTS[part];
    return (d && d.seedKind) || null;
  }

  /* 触发一个种子。n = 触发序号（1..），也接受 'anemo'/'geo'/'electro'。
   *
   * 返回值 = 真的触发了（给交互键和测试共用的读数）。 */
  function triggerSeed(state, which) {
    if (!state || state.phase !== 'run' || !state.car) return false;
    var car = state.car;
    var kind = which;
    if (typeof which === 'number') {
      /* 从"车上第 n 个种子"反查种类。用**零件顺序**而不是颜色组，
       * 因为种子是内嵌件，不进 groups。 */
      var seeds = car.parts.filter(function (p) { return p.def && p.def.seedKind; });
      var pk = seeds[which - 1];
      kind = pk ? pk.def.seedKind : null;
    }
    if (!kind) return false;
    state.seedUse = state.seedUse || { anemo: 0, geo: 0, electro: 0 };
    if (state.seedUse[kind] > 0) return false;                 // 一次性
    var has = car.parts.some(function (p) { return p.def && p.def.seedKind === kind; });
    if (!has) return false;
    state.seedUse[kind] = 1;

    if (kind === 'anemo') {
      state.windField = {
        x: car.x, y: car.y,
        r: Params.windRadius, ttl: Params.windTtl, maxTtl: Params.windTtl,
        rise: Params.windRise
      };
      log(state, 'wind_field x=' + car.x.toFixed(1) + ' r=' + Params.windRadius);
    } else if (kind === 'geo') {
      /* 柱底 = 触发那一刻**脚下**的地面（可能已经是另一根柱的顶，
       * 但一次性用完就没了，所以这里用 groundY 是安全的）。 */
      var g0 = groundY(state, car.x);
      state.pillars = (state.pillars || []).concat([{
        x: car.x, w: Params.pillarW, top: g0 + Params.pillarH, born: state.time
      }]);
      log(state, 'pillar x=' + car.x.toFixed(1) +
        ' top=' + (g0 + Params.pillarH).toFixed(2));
    } else if (kind === 'electro') {
      car.dashT = Params.dashTime;
      car.dashDir = (car.vx >= -0.1) ? 1 : -1;
      log(state, 'dash_start t=' + Params.dashTime + ' dir=' + car.dashDir);
    }
    return true;
  }

  /* 浮力/配重的**系挂校验**（第 63 轮新增）。
   *
   * 参考原话（萌娘百科）：
   *   · 气球「会被系在其下方最靠近自身的方框上；否则会直接飘走」
   *   · 重物「会系在其上方最接近自身的方框上；否则会直接落地，不起任何作用」
   *
   * ⚠ 坐标系：建造网格 **row 越大越靠下**（partPos: y = (ROWS−1)/2 − r）。
   *   所以"气球在框的**上方**"= 气球的 row 更小 = 往 r+1 方向能找到框。
   *   "沙袋在框的**上方**"= 沙袋的 row 更小 = 往 r−1 方向能找到框。
   *
   * 注意这两者的方向**都朝同一个地方看**（气球找它下方的框、沙袋找它上方的框），
   * 但它们的 dir 是相反的 —— 这才是容易写反的地方。
   */
  function tetherCheck(build, r, c, kind) {
    var cells = build.cells || {};
    // 气球：框必须在它下方 → 沿 row 增大方向找
    // 沙袋：框必须在它上方 → 沿 row 减小方向找
    var dir = kind === 'below' ? 1 : -1;
    for (var rr = r + dir; rr >= 0 && rr < BUILD_ROWS; rr += dir) {
      var cell = cells[rr + ',' + c];
      if (!cell) continue;
      var d = PARTS[cell.part];
      if (d && d.structure) return { ok: true, row: rr };
    }
    return { ok: false, row: -1 };
  }


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
    /* 建造格 → 车体局部坐标（米）。锚点是常量 BUILD_ANCHOR_ROW，
     * 不是 (BUILD_ROWS-1)/2 —— 为什么必须是常量，见 BUILD_ROWS 那段注释。 */
    return { x: (c - (BUILD_COLS - 1) / 2) * CELL, y: (BUILD_ANCHOR_ROW - r) * CELL };
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
    var mass = 0, interactives = [];
    var hasPig = false;
    var groups = [];        // 同种（同色）可启动零件 = 一个组
    Object.keys(build.cells).forEach(function (k) {
      var cell = build.cells[k];
      var rr = parseInt(k.split(',')[0], 10);
      var cc = parseInt(k.split(',')[1], 10);
      var def = PARTS[cell.part];
      var p = partPos(rr, cc);
      var cnt = cellCount(cell);
      /* 可叠零件（热气球/压舱石）：一个格子代表 cnt 个物理件。
       * 质量按个数算；热气球还要记下自己 lifts 多少 kg（浮力）。
       * 这里把 cnt 存到零件上，是为了"扎破一个"之后能就地减一，
       * 而不必重建整车（重建会丢速度、丢 HP，也会让回放跳变）。 */
      var isStack = !!def.stack;
      var pm = def.mass * (isStack ? cnt : 1);
      /* 系挂校验：气球必须有下方的框、沙袋必须有上方的框。
       * 挂空的不算数 —— 见 `tetherCheck()` 的注释（参考的原始规则）。
       * 伞和风之翼也走同一条：它们必须挂在车顶才吃得到风。 */
      var tethered = true;
      if (def.tether) tethered = tetherCheck(build, rr, cc, def.tether).ok;
      parts.push({ part: cell.part, def: def, r: rr, c: cc, lx: p.x, ly: p.y, dir: cell.dir,
                   hp: def.hp || 1, n: isStack ? cnt : 1, key: k,
                   tethered: tethered });
      mass += pm;
      if (def.interactive) {
        // 只有"占面板键位"的交互件才进 groups；气球/沙袋/霄灯走车身点击
        if (!def.tapOnBody && !def.oneShot) {
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
    var w = maxX - minX, h = maxY - minY;
    var inertia = mass * (w * w + h * h) / 12;
    var car = {
      parts: parts, wheels: wheels,
      mass: mass, inv: 1 / mass, invI: 1 / Math.max(0.4, inertia),
      hull: { minX: minX, maxX: maxX, minY: minY, maxY: maxY },
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      hasPig: hasPig,
      groups: groups,
      /* ⚠ 第 71 轮：`powerSupply/powerDemand/powerShort` 三个字段**已删**。
       * 它们是"动力容量"系统的读数，用户明确要求去掉这套设定。
       * 只删零件表里的 powerSrc/drawPower 是不够的 —— 这三个字段还在的话，
       * HUD、三星条件、提示文案会继续读它们，界面上仍然显示"动力 2/2"。
       * `tools/test_seeds.js` 的 A4–A6 三条断言直接盯这三个字段（=== undefined），
       * 就是防止有人把它们加回来。
       *
       * 驱动件现在**装了就一直出力**：没有"接通"、没有"超载"、没有"容量"。 */
      interactives: interactives,
      pumpCharge: 0, pumpHeld: false, braking: false, odo: 0, dashT: 0
    };
    recomputeLift(car);
    return car;
  }

  /* 浮力：热气球每个 lifts `liftMass` kg，等效"负重量"。
   * 存成 `liftMass`（kg）而不是力（N），是因为重力是可调参数 ——
   * 用 kg 表达的话，改重力时气球和车一起变重变轻，浮沉关系不乱。
   * netMass = 真实质量 - 浮力质量：>0 会往下掉，<0 会往上飘。
   *
   * ⚠ **没系住的球不提供浮力**（第 63 轮）。参考的规则是"否则会直接飘走"，
   * 不是"照样给你浮力"。同理所未被系住的重物也不给重量。 */
  function recomputeLift(car) {
    var lift = 0, bags = 0, loose = 0, wind = 0;
    car.parts.forEach(function (p) {
      if (p.def.liftMass) {
        if (p.tethered === false) { loose += (p.n || 1); return; }   // 飘走的球不算
        lift += p.def.liftMass * (p.n || 1);
      }
      if (p.def.dropOne && p.tethered !== false) bags += (p.n || 1);
      /* 吃风的零件（伞/风之翼）：没系住的不算。
       * `catchesWind` 是升力**系数**，不是力 —— 真正乘上去的是
       * `Params.windRise`，这样调风力不用改零件表。 */
      if (p.def.catchesWind && p.tethered !== false) wind += p.def.catchesWind;
    });
    car.liftMass = lift;
    car.sandbagCount = bags;
    car.looseBalloons = loose;
    car.windCatch = wind;                 // 0 = 风场对它没用
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
      /* ---------- 种子三兄弟的运行时状态（第 71 轮） ----------
       *
       * `seedUse`   : { anemo:0, geo:0, electro:0 } —— 每种种子的使用次数。
       *               所有种子都是**一次性**，第二次触发直接被拒。
       * `windField` : 当前风场 { x, y, r, ttl, maxTtl, rise } 或 null。
       *               风场是**范围性**的：只有车在半径内且带伞/风之翼才吃风。
       * `pillars`   : 岩柱数组 [{ x, w, top, born }]。柱顶就是那一带的**新地面**
       *               （读 `groundY(state, x)`，不要直接读 terrain）。
       * `barriers`  : 雷屏障 [{ col, h }] —— 冲刺状态可以穿过，否则挡住。
       * 这四个状态都挂在 state 上（不是全局），因为它们必须随这一局一起消失。
       */
      seedUse: { anemo: 0, geo: 0, electro: 0 },
      windField: null, pillars: [], barriers: [],
      events: [],
      replay: []
    };
    /* 雷屏障从关卡数据搬进来（关卡写 `barriers: [{col, h}]`） */
    ((level && level.barriers) || []).forEach(function (b) {
      state.barriers.push({ col: b.col, h: b.h || 4 });
    });
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
  /* 点车身：扎气球 / 扔沙袋 / 点霄灯（第 63 轮加入霄灯）。
   *
   * 霄灯和气球/沙袋同一套入口，因为它们的语义都是"什么时候动手"，
   * 都该由玩家直接点那个零件，而不是占面板键位。 */
  function tapAt(state, wx, wy) {
    if (state.phase !== 'run' || !state.car) return null;
    var best = null, bestD = 1e9;
    state.car.parts.forEach(function (p) {
      if (!p.def.stack && !p.def.oneShot) return;
      var wp = worldOf(state.car, p.lx, p.ly);
      var d = Math.hypot(wp.x - wx, wp.y - wy);
      if (d < bestD) { bestD = d; best = p; }
    });
    if (!best || bestD > 0.85) return null;
    /* 霄灯：点一次点火，烧 1.2 秒。已经烧着/烧完的不再响应 ——
     * 否则玩家连点会把"一次性"变成"无限"。 */
    if (best.def.oneShot) {
      if (best.burn > 0 || best.burnLogged) return null;
      best.burn = best.def.burnTime || 1.2;
      log(state, 'firework_light at=' + best.r + ',' + best.c);
      return { ok: true, kind: 'firework', part: best };
    }
    var kind = best.def.liftMass ? 'balloon' : 'sandbag';
    var ok = kind === 'balloon' ? popBalloon(state) : dropSandbag(state);
    return ok ? { ok: true, kind: kind, part: best } : null;
  }

  function worldOf(car, lx, ly) {
    var ca = Math.cos(car.a), sa = Math.sin(car.a);
    return { x: car.x + lx * ca - ly * sa, y: car.y + lx * sa + ly * ca };
  }

  function damageCar(state, vn) {
    if (state.time < (state.spawnGrace || 0)) return false;   // 出生落地不算摔
    if (vn < Params.damageMin) return false;
    // 同一段路连续磕碰只算一次（0.35 秒冷却），否则木框会被接触帧打穿
    if (state.time - (state.lastStructHurt || -9) < 0.35) return false;
    state.lastStructHurt = state.time;
    /* 伤害分档必须和"物理上真的到得了的速度"对齐。
     * 旧代码写的是 `vn > 14 ? 2 : 1`，但 Params.maxSpeed = 12 给整车速度设了硬上限，
     * 实测 30 米自由落体砸地也只能到 11.97 m/s —— 那个 2 点档是**死档**，
     * 永远进不去。改成下面的三段，每一段都实测可达：
     *   4.5 ~ 8   磕一下      1 点（木框裂一道）
     *   8 ~ 11    撞狠了      2 点（木框接近散）
     *   ≥ 11      从高处砸下来 直接散架
     *
     * 为什么下沿是 4.5 而不是 6：木框的耐久是 3，而 3 段裂纹要**两次 1 点**
     * 才走得完（3 → 2 → 1）。以前只有在"撞到 4.5 以上、又没到 8"的窗口里
     * 才掉 1 点，那个窗口又窄又难踩 —— 实测 340 局随机造法里
     * **hp = 1 这一档一次都没出现过**（9 点直接碎，或者 2 点然后失败）。
     * 也就是说 win 玩家眼里的木框只有"完好"和"已碎"两态，
     * drawPartShape 里画好的裂纹/破损两档美术**根本没人看到过**。
     *
     * 把下沿挪到 4.5（= 分级接触反馈的第 3 档），窗口变成 4.5 ~ 8，
     * 宽了 3.5 倍，两次 1 点才走得到的"破损"才真的会出现。
     * 门槛本身有 2.5 倍余量：六关标准解的 max|vn| 只有 1.27 ~ 1.91。 */
    var dmg = vn >= 11 ? 9 : (vn >= 8 ? 2 : 1);
    var broken = [];
    var frames = state.car.parts.filter(function (p) { return p.def.structure; });
    /* 已经没有木框了（全碎了）就什么都不用做 —— 并且**必须返回 false**：
     * 返回值的意思是"这一下真的扣了耐久"，渲染层拿它决定要不要播撞击演出。
     * 返回 true 会让一辆已经把框撞光的车，每 0.35 秒继续播一次全屏白闪 + 慢动作
     * （4 米自由落体实测到了第 2 条 impact，框早就没了）。 */
    if (!frames.length) return false;
    state.car.parts.forEach(function (p) {
      if (!p.def.structure) return;
      p.hp -= dmg;
      if (p.hp <= 0) broken.push(p);
    });
    if (broken.length) {
      /* 碎了：木框从车上消失，框里的东西真的掉出来（自由体：会落地、会滚）。
       * 这一支**不写 struct_hurt** —— 碎本身就是最重的一次"打到肉"，
       * 再补一条会让渲染层同一瞬间叠两种开裂音效 + 两次震屏。 */
      state.hullBroken = true;      // 「不散架」星：哪怕只碎一格，这颗星就没了
      broken.forEach(function (p) {
        log(state, 'part_broken part=' + p.part + ' at=' + p.r + ',' + p.c);
      });
      var brokenKeys = broken.map(function (p) { return p.r + ',' + p.c; });
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
    } else {
      /* 掉耐久但还没碎，也是一件"玩家必须看见"的事：木框裂了一道缝。
       * 渲染层原来只能靠 part_broken（碎了）才知道结构受损 —— 也就是说
       * 从 3 掉到 2、从 2 掉到 1 这两次，画面上**一声不响**，玩家要到结算页
       * 发现「不散架」这颗星没了才回头怀疑"什么时候撞的"。
       * 现在每次掉血都写一条事件，渲染层照样用事件流，不碰物理。 */
      var alive = state.car.parts.filter(function (p) { return p.def.structure && p.hp > 0; });
      var minHp = alive.length ? Math.min.apply(null, alive.map(function (p) { return p.hp; })) : 0;
      log(state, 'struct_hurt v=' + vn.toFixed(1) + ' hp=' + minHp);
    }
    var now = state.time;
    if (vn > 10 && now - (state.lastPigHurt || -9) > 0.6) {
      state.lastPigHurt = now;
      state.pigHP -= 1;
      log(state, 'pig_hurt hp=' + state.pigHP);
      if (state.pigHP <= 0) resolve(state, 'pig_dead');
    }
    /* "这一下打到肉了"的时刻。
     *
     * 猪的表情本来有四档（normal / scared / dizzy / hurt / dead），其中
     * dizzy 的判定是 `(state.run.lastImpactAt || -9) > now - 0.7` ——
     * 而**引擎从来没写过这个字段**。`undefined || -9` 恒为 -9，
     * 那个分支就静悄悄地死了：撞到掉耐久的那一下，猪的表情一动不动。
     * 这类"渲染层读、引擎不写"的字段不报错、不红测试，只能靠对账发现
     * （tools/audit_dead_reads.js 就是干这个的，它一次查出 3 个）。
     *
     * 写在这里而不是渲染层，是因为"撞了没有"是物理的判断（damageCar 的返回值），
     * 渲染层拿事件流重算一遍就成了第二份真相。 */
    state.lastImpactAt = now;
    return true;   // 这一下真的扣了耐久（impact 事件挂在这个返回值上）
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
      var gy = groundY(state, L.x) + L.r;
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
        /* 第 71 轮：`power=…` 这个读数随动力容量系统一起删了。
         * 还留着它（哪怕是 `power=0` 常量）会让读日志的人以为"动力"还存在，
         * 而真正该看的是"用了几颗种子"。 */
        ' seeds=' + (state.seedUse ? ('anemo' + state.seedUse.anemo +
          ',geo' + state.seedUse.geo + ',electro' + state.seedUse.electro) : '-') +
        ' time=' + state.time.toFixed(1));
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
      /* 1-3 的第三星原来是 `powerSpare`（出发时动力余量 ≥ N）。
       * 动力容量系统整个删掉之后它没有意义了，改成 **`seedSpare`：
       * 出发时车上一颗种子都没用** —— 也就是"这一关你没靠种子通关"。
       * 这仍然是一道真取舍：1-3 装了种子会更容易过，但拿不到这颗星。
       * `tools/test_seeds.js` 里有这条的反向对照。 */
      case 'seedSpare': return !!state.seedUse &&
        (state.seedUse.anemo + state.seedUse.geo + state.seedUse.electro) === 0;
      case 'noFlip': return (state.maxAngle || 0) <= (ch.maxAngle || 0.785);
      /* `motorUse` 也随马达删了。1-5 的「不用马达」改成「不用驱动件」：
       * 一辆一个 tool 都没有的车跑通这一关。 */
      case 'noTool': return !state.car ||
        !state.car.parts.some(function (p) { return p.def && p.def.tool; });
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
    var was = !!state.car.braking;
    state.car.braking = !!on;
    /* 只在**状态真的变了**时才写事件。
     * 原来是 `if (on) log('brake on')` —— 无条件写。
     * 而浏览器按住 S 会 auto-repeat（约 30 次/秒），于是事件流里每秒塞 30 条
     * 一模一样的 `brake on`（实测按 0.7 秒写了 13 条）。
     * 事件数组是只增不减的，它会被 test_perf_stable 一起量进去。 */
    if (state.car.braking !== was) log(state, state.car.braking ? 'brake on' : 'brake off');
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

  /* 取消按住（不是"松开"）。
   *
   * 场景：玩家正按着打气筒蓄力，突然 alt-tab / 切标签页 / 锁屏。
   * 那一刻 `keyup` 落到了别的窗口上，页面上永远收不到那一下松手。
   * 于是：
   *   · `state.heldKeys['1']` 永远留着 → 回来以后再按 1 会被 "已经按着了" 挡掉，
   *     玩家会认为键盘坏了；
   *   · `car.pumpHeld` 一直是 true、零件一直亮着 —— 回来以后车自己在蓄力。
   *
   * 为什么用"取消"而不是"松开"（releaseInteract）：松开意味着**放一次气**，
   * 车会被推出去一段。玩家并没有做这个决定 —— 他只是把窗口切走了。
   * 一局里突然凭空多出一次冲量，比"这次蓄力白蓄了"难受得多。
   * 所以这里只清状态，`pumpPress` 也不动（那一次按下确实发生过）。
   *
   * 返回是否真的清掉了什么：给测试一个"有没有东西被清"的读数，
   * 也让渲染层能在需要时只播一次提示。 */
  function cancelInteract(state) {
    if (!state || !state.car || state.phase !== 'run') return false;
    var car = state.car;
    var any = false;
    (car.groups || []).forEach(function (g) { if (g.on) { g.on = false; any = true; } });
    if (car.pumpHeld || (car.pumpCharge || 0) > 0) any = true;
    car.pumpHeld = false;
    car.pumpCharge = 0;
    return any;
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

    /* ---------- 风场 / 冲刺的计时（第 71 轮） ----------
     * 两者都是**限时**状态，所以时间推进必须只在这里一份。
     * 风场到点就置 null（渲染层读 null 就不画）；
     * 冲刺到点写一条事件（HUD 要提示"冲刺结束"）。 */
    if (state.windField) {
      state.windField.ttl -= dt;
      if (state.windField.ttl <= 0) {
        state.windField = null;
        log(state, 'wind_field_end');
      }
    }
    if (car.dashT > 0) {
      car.dashT = Math.max(0, car.dashT - dt);
      if (car.dashT === 0) log(state, 'dash_end');
    }

    /* ══════════ 驱动件出力（第 71 轮：容量系统已删）══════════
     *
     * 旧实现（第 63 轮）是"容量恒定，接通且不超载才出力"，再往上是
     * "装马达、轮子凭空获得牵引力"。两版都在回答同一个问题：
     * **驱动件凭什么转**。
     *
     * 现在的答案最简单：**装了就一直转**。
     *   · 没有动力源，没有连通，没有容量，没有超载打折；
     *   · `p.def.tool` 就是全部条件；
     *   · 推力全部来自零件表里的 `thrust`。
     *
     * 用户原话是「不要设置什么动力容量的设定」。删掉之后玩家开局要做的事
     * 从"心算 2+5 对比 1+2"变回"这件东西该装哪、朝哪边"——
     * 后者才是这个游戏的内容。
     *
     * **一次性推力（霄灯）不在这里**：它认 `burn` 计时，和驱动件无关。
     */
    var tools = [];
    car.parts.forEach(function (p) {
      if (p.def.tool) tools.push(p);
    });

    /* 一次性推力：点一次 → burn 计时开始 → 每帧出推力 → 烧完 */
    car.parts.forEach(function (p) {
      if (!p.def.oneShot) return;
      if (p.burn > 0) {
        p.burn = Math.max(0, p.burn - dt);
        if (p.burn === 0 && !p.burnLogged) {
          p.burnLogged = true;
          log(state, 'firework_out at=' + p.r + ',' + p.c);
        }
      }
    });

    for (var s = 0; s < sub; s++) {
      var fx = 0, fy = -G * car.mass, tq = 0;

      /* ---------- 驱动件推力（沿各自箭头方向，随车体旋转） ----------
       *
       * ⚠ 力矩这一项踩过一个大坑（第 63 轮）：
       *
       * 第一版按"推力作用在零件的真实位置上"算力矩：
       *     tq += (tp.lx * (f * twy)) - (tp.ly * (f * twx))
       * 物理上当然是对的 —— 装车顶往前推就会让车**前翻**。
       * 但实测 1-3 的标准解：风车桨在框上方一格（ty=+1），
       * 水平推力 5 m/s² 配上这个力臂，车在 1.5 秒内转到 -110°，
       * 2 秒后 -178.8°（整台车翻了个面，桨变成朝后），然后 permanent stuck。
       *
       * 两件事同时出了问题：
       *   1) 力矩臂太大 —— 一格 = 1 米，而车只有 3 米宽，
       *      水平推力作用在车顶就等于一根 1 米的撬棍；
       *   2) 玩家**没有工具抵抗它** —— 参考里靠"配重/尾翼"平衡，
       *      而我们这一版没有尾翼，沙袋还只能挂框下面。
       *
       * 所以现在把力矩**折到 0.25 倍**并夹在合理范围内：
       * 保留"装得太高会抬头"的手感，但不至于把车掀翻。
       * 这是一个**手感参数**，不是物理常数 —— 记在这里，免得以后被当成 bug 改回去。 */
      for (var ti = 0; ti < tools.length; ti++) {
        var tp = tools[ti];
        var f = (tp.def.thrust || 0) * car.mass;
        var tv = dirVec(tp.dir || 0);
        var tca = Math.cos(car.a), tsa = Math.sin(car.a);
        var twx = tv[0] * tca - tv[1] * tsa;
        var twy = tv[0] * tsa + tv[1] * tca;
        fx += f * twx;
        fy += f * twy;
        var tqRaw = (tp.lx * (f * twy)) - (tp.ly * (f * twx));
        tq += tqRaw * 0.25;
      }
      /* ---------- 一次性推力（霄灯） ---------- */
      for (var oi = 0; oi < car.parts.length; oi++) {
        var op = car.parts[oi];
        if (!op.def.oneShot || !(op.burn > 0)) continue;
        var of = (op.def.thrust || 0) * car.mass;
        var ov = dirVec(op.dir || 0);
        var oca = Math.cos(car.a), osa = Math.sin(car.a);
        var owx = ov[0] * oca - ov[1] * osa;
        var owy = ov[0] * osa + ov[1] * oca;
        fx += of * owx;
        fy += of * owy;
        tq += (op.lx * (of * owy)) - (op.ly * (of * owx));
      }

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

      /* ══════════ 风场（第 71 轮）══════════
       *
       * 规则只有三句：
       *   1. 车必须在风场**半径内**（范围性 —— 用户原话）；
       *   2. 车上必须有**吃风的零件**（伞 / 风之翼），`windCatch > 0`；
       *   3. 升力 = `windRise × ΣcatchesWind`，直接加在 fy 上。
       *
       * ⚠ 第 2 条是这套机制的全部意义。第一版写成"风场无条件抬升整台车"，
       * 于是风种变成"免费的上升按钮"，伞和风之翼就没有存在理由。
       * `tools/test_seeds.js` 的 B6 就是这条的反向对照：**没带伞的车
       * 在同一个风场里必须不动**。
       *
       * 升力作用在**车心**（不加力矩）：风是从下面整片托上来的，
       * 不是顶在某个零件上。加了力矩会让车在风里打转，那不是"被托起来"。
       */
      if (state.windField && car.windCatch > 0) {
        var wf = state.windField;
        var wdist = Math.hypot(car.x - wf.x, car.y - wf.y);
        if (wdist <= wf.r) {
          /* 边缘衰减：中心满力、边缘 40%。这样"在风场里挪一点"仍有手感，
           * 而"开出风场"是连续变弱而不是突然断电 —— 突然断电看起来像 bug。 */
          var wfall = 1 - 0.6 * (wdist / wf.r);
          /* ⚠ 必须**先抵消重力**再谈上升。直接加 `windRise × 质量` 只够
           * 对抗 2.0 而重力是 16 —— 车纹丝不动，看起来像"风场没生效"。
           * 写 `(G + ...)` 之后 `windRise` 才是"净上升加速度"这个直觉含义。 */
          fy += (G + Params.windRise * car.windCatch * wfall) * car.mass;
        }
      }

      /* ══════════ 雷种冲刺（第 71 轮）══════════ */
      if (car.dashT > 0) {
        var ddir = car.dashDir || 1;
        car.vx += Params.dashAccel * ddir * h;
        if (Math.abs(car.vx) > Params.dashMaxSpeed) {
          car.vx = Params.dashMaxSpeed * Math.sign(car.vx);
        }
      }

      // 轮子
      /* ⚠ 轮子**自己不再产生驱动力**（第 63 轮）。
       *
       * 旧设计有 `motorAccel` —— 装了马达，轮子就凭空获得 6 m/s² 的牵引力，
       * 和轮子接不接地、有没有动力连通都无关。这也是"反人类直觉"的一部分：
       * 一个装在车顶的马达能让地面上的轮子转，中间没有任何传动件。
       *
       * 新设计：轮子只负责**把已有的水平推力变成滚动力**（通过抓地力上限），
       * 推力全部来自驱动件（风车桨/喷气口）的一次性施加。
       * `perWheel = 0` 让下面那一段的 `drive` 恒为 0，只保留摩擦/滚动阻力的正确语义。 */
      var groundWheels = 0;
      var perWheel = 0;
      for (var i = 0; i < car.wheels.length; i++) {
        var w = car.wheels[i];
        var wp = worldOf(car, w.lx, w.ly);
        var r = w.def.radius;
        var gY = groundY(state, wp.x);
        var pen = gY - (wp.y - r);
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
            /* 档位门槛走 Params，和 damageMin 同桌对账（见 DEFAULTS 里那段注释）。
             * 原先四个门槛是散落在这行里的字面量，改一个要全文搜；
             * 也因为不是参数，量具就没法把它们当变量扫 —— 第 55 轮前五份探针
             * 都是这么读错的（改的档位根本没进引擎）。 */
            var lvl = vnAbs > Params.touchLvl4 ? 4
              : (vnAbs > Params.touchLvl3 ? 3 : (vnAbs > Params.touchLvl2 ? 2 : 1));
            var lastKey = 'lastTouch' + lvl;
            if (!state[lastKey] || state.time - state[lastKey] > 0.06) {
              state[lastKey] = state.time;
              log(state, 'touch lvl=' + lvl + ' v=' + vnAbs.toFixed(1) + ' x=' + wp.x.toFixed(1));
            }
          }
          if (vn < -0.8) {
            if (Math.abs(vn) > Params.damageMin) {
              /* 只在**真的扣了耐久**时才写 impact。
               *
               * 渲染层对每一条 impact 做的是一整套大演出：
               *   slowmo = 0.35、shake += 0.85、flash = 1、vignette = 1、撒碎屑
               * 而 impact 原来**没有任何去重**：物理每帧 4 个子步 × 每个轮子都可能满足
               * 条件，一次硬着陆实测能连写 **34 条**（tools/probe_impact_spam.js）。
               * 后果是慢动作被反复重置、震屏叠到上限、碎屑撒 34 次（340 颗）——
               * 同一时刻玩家看到的不是"撞了一下"，是一段糊掉的白屏。
               *
               * 而 damageCar 自己本来就有 0.35 秒冷却，所以"真的扣了耐久"
               * 天然就是去重过的。把 impact 挂在这个返回值上，
               * 一次撞击 = 一条事件，语义也对（impact 的意思就是"这一下打到肉了"）。 */
              if (damageCar(state, Math.abs(vn))) {
                log(state, 'impact v=' + Math.abs(vn).toFixed(1) + ' at=' + w.r + ',' + w.c);
              }
            }
          }
        }
      }

      /* 贴地稳定器：把车体角度拉向**两个轮子接触点连成的线**。
       *
       * ⚠ 目标角不能用 `atan(surfaceSlope(car.x))`（车身中心的坡度）。
       *
       * 那是第一版的写法，它让车稳定在一个**错误的姿态**上：
       * 车身中心在一个位置、两个轮子在另外两个位置，而地形是弯的 ——
       * 中心点的切线根本不是"两个轮子连线"的角度。
       * 实测 1-2：车稳定在 −24°，而车身中心处的坡度只有 0~2°，
       * 玩家看到的就是用户截图里那个"横在坡上的车"。
       *
       * 正确做法：取两个（或任一对）着地轮子的**接触点**，
       * 用它们的连线定目标角 —— 这才是"轮子压在地形上时，车身应该是什么姿态"。
       *
       * 判据同时从 `groundWheels >= 2` 放宽到 `>= 1`：
       * 原来的 `>= 2` 有个恶性循环 —— 车一旦歪到让一个轮子离地，
       * 稳定器立刻**停止工作**，而那时恰恰最需要它，于是车越翻越快，
       * 最后整台翻过来（1-2 实测 t=2.27 还是 −33°，t=3.52 已经 −172°）。 */
      if (groundWheels >= 1) {
        var targetA;
        var cont = [];
        for (var wi = 0; wi < car.wheels.length; wi++) {
          var ww = car.wheels[wi];
          var wwp = worldOf(car, ww.lx, ww.ly);
          var wwy = groundY(state, wwp.x);
          // 只算"真的贴着地"的轮子（轮底与地表的缝隙 < 5 cm）
          var wBottom = wwp.y - ww.def.radius;
          if (wwy - wBottom > -0.05) {
            cont.push({ x: wwp.x, y: wwy });
          }
        }
        if (cont.length >= 2) {
          // 取 x 最小/最大的两个当左右支点
          cont.sort(function (a, b) { return a.x - b.x; });
          var lo = cont[0], hi = cont[cont.length - 1];
          if (hi.x - lo.x > 0.2) {
            targetA = Math.atan2(hi.y - lo.y, hi.x - lo.x);
          } else {
            targetA = Math.atan(ter.surfaceSlope(car.x));
          }
        } else {
          /* 只有一个轮子着地：退回到"车身中心坡度"这个近似。
           * 虽然粗，但比完全不管好 —— 而且这时阻尼会把角速度吃掉。 */
          targetA = Math.atan(ter.surfaceSlope(car.x));
        }
        var err = targetA - car.a;
        car.w += err * 11.0 * h;
        car.w *= (1 - Math.min(0.9, 3.6 * h));
      }

      // 车壳四角（含无轮子时的支撑）
      var hb = car.hull;
      var ins = 0.08;
      var corners = [[hb.minX + ins, hb.minY + ins], [hb.maxX - ins, hb.minY + ins],
                     [hb.minX + ins, hb.maxY - ins], [hb.maxX - ins, hb.maxY - ins]];
      for (var k = 0; k < corners.length; k++) {
        var cp = worldOf(car, corners[k][0], corners[k][1]);
        var gy = groundY(state, cp.x);
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
          if (vn2 < -Params.damageMin) {
            // 同轮子那条一样：一条 impact = 一次真的扣耐久（damageCar 自带 0.35 秒冷却）
            if (damageCar(state, Math.abs(vn2))) {
              log(state, 'impact v=' + Math.abs(vn2).toFixed(1) + ' at=chassis');
            }
          }
        }
      }

      // ---- 整车地面摩擦（真正决定"滑不滑"的量）----
      // 几何判断是否贴地：车体最低点离地表 ≤ 0.3 m 就算在地上
      var hullBottom = worldOf(car, 0, car.hull.minY).y;
      var groundGap = hullBottom - groundY(state, car.x);
      var onGround = (groundWheels > 0) || (groundGap < 0.3);
      if (onGround) {
        var vh = Math.hypot(car.vx, car.vy);
        if (vh > 0.02) {
          var mat = ter.matAt(car.x);
          var gMul = mat === 'ice' ? 0.08 : (mat === 'stone' ? 0.75 : 1.0);
          var gf = Params.groundFriction * (Params.groundGrip || 1) * gMul;
          // 有推力输出/刹车时不要额外钉住（推力要能推得动车、刹车已有自己的减速度）
          var powered = tools.length > 0 || car.dashT > 0 ||
            car.parts.some(function (p) { return p.burn > 0; }) ||
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
      var driving = tools.length > 0 || car.dashT > 0 ||
        car.parts.some(function (p) { return p.burn > 0; }) ||
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

    /* ══════════ 雷屏障碰撞（第 71 轮）══════════
     *
     * 屏障是一道竖直的墙：`{ col, h }` = 从那一列的地面往上 h 米。
     * 规则只有一条：**冲刺状态（car.dashT > 0）穿得过，否则挡住**。
     *
     * 挡住的方式是"推回去 + 抹掉纵向速度"，而不是直接判失败 ——
     * 玩家撞上墙的第一反应应该是"我被挡住了"，而不是"游戏结束了"。
     * 推回到屏障前 0.02 米而不是正好压线：压在线上时下一帧的
     * `>= ` 判定会抖动，车会在墙里外反复闪。
     *
     * ⚠ 这里用**车身包围盒的最右沿**（car.x + hull.maxX）判断，
     * 不是车心 —— 车心离墙还有半米时车头就已经撞上了。
     */
    if (state.barriers && state.barriers.length && !(car.dashT > 0)) {
      for (var bri = 0; bri < state.barriers.length; bri++) {
        var br = state.barriers[bri];
        var bTop = groundY(state, br.col + 0.5) + br.h;
        if (car.y - car.hull.minY > bTop) continue;        // 从上面飞过去了
        var nose = car.x + car.hull.maxX;
        if (nose < br.col || car.x - car.hull.maxX > br.col + 1) continue;
        /* 从左边撞：推回去。从右边撞（倒车撞回来）同理。 */
        var fromLeft = car.x < br.col + 0.5;
        if (fromLeft && nose >= br.col + 0.02) {
          car.x = br.col - car.hull.maxX - 0.02;
          if (car.vx > 0) car.vx = 0;
          if (!state.barrierHitLogged) {
            state.barrierHitLogged = true;
            log(state, 'barrier_block col=' + br.col);
          }
        } else if (!fromLeft && car.x - car.hull.maxX <= br.col + 0.98) {
          car.x = br.col + 1 + car.hull.maxX + 0.02;
          if (car.vx < 0) car.vx = 0;
        }
      }
    }

    /* 气球碰地 = 扎破（参考的行为：碰到墙/地自动破）。
     * 这条不是"惩罚"而是"节奏"：气球让车飞起来，但一旦落地就全泄了 ——
     * 所以玩家必须在飞的时候想清楚"现在还要不要这么多气球"。
     * 判定用气球球心低于地表（不是车体）：车翻滚时气球可能先着地。 */
    var balloons = car.parts.filter(function (p) { return p.def.liftMass && (p.n || 0) > 0; });
    for (var bi2 = 0; bi2 < balloons.length; bi2++) {
      var bp = worldOf(car, balloons[bi2].lx, balloons[bi2].ly);
      if (bp.y - 0.3 <= groundY(state, bp.x)) {
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
      var bx = b.col + 0.5, by = groundY(state, b.col + 0.5) + 0.5;
      if (Math.abs(car.x - bx) < 1.7 && Math.abs(car.y - by) < 1.7) {   // 放宽：车体碰到就算
        b.got = true; state.boxesGot++;
        /* 吃到木箱的时刻 —— 渲染层用它让猪笑（`lastBoxAt > now - 1.0`）。
         * 和 lastImpactAt 一样，这个字段以前**引擎从来没写过**，
         * 于是"吃到木箱"在画面上唯一的反馈就是 HUD 那个数字 +1。
         * 一个刚帮你达成「全木箱」三星的动作，连一声、一个表情都没有。 */
        state.lastBoxAt = state.time;
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
      var goalAlt = Math.abs(car.y - groundY(state, car.x));
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
    /* 限时**以关卡为准**，全局值只做兜底。
     *
     * 在这之前这里写死 `Params.demoTimeLimit`（60 秒），而每个关卡 JSON 里
     * 都写着 `timeLimit: 120` —— 那个字段**一次都没被读过**，是个假旋钮：
     * 策划改了它，游戏毫无反应（`probe_time_cap.js` 量出来的）。
     *
     * 为什么是 120 而不是 60：`probe_slow_legal.js` 把马达加速度一路压到
     * 1.2 m/s²，最慢的**合法通关**是 22.13 秒；`probe_timeout_reach.js` 跑
     * 1440 个随机造法，60 秒上限一次都没触发。也就是说 60 秒对真实玩家
     * 是条看不见的线 —— 秒表只涨不封、看门狗只警告"8 秒没进展"，
     * 真撞上去时失败卡写「超时」，玩家只会觉得"我明明一直在前进"。
     * 120 秒给到 5 倍余量，它退回它该有的角色：**兜底**，不是规则。 */
    var limit = (state.level && state.level.timeLimit !== undefined &&
                 state.level.timeLimit !== null)
      ? state.level.timeLimit : Params.demoTimeLimit;
    if (state.time > limit) { resolve(state, 'timeout'); return; }

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
  /* ══════════════ 标准解（第 63 轮随零件表重写）══════════════
   *
   * 每一关的标准解都必须证明**这一关要教的那件事**能用一个具体造法做到。
   * 零件换了之后，下面每一行都要重推 —— 不能只把 `motor` 改名成 `anemo_core`，
   * 因为它们的质量、推力、占用都不同（旧马达 1.8 kg / 6 m/s²，
   * 新风种 0.8 kg + 风车桨 0.5 kg / 5 m/s²）。
   *
   * 摆位约定（六关通用）：第 4 行是车身、第 5 行挂轮子、第 3 行是车顶。
   * 动力源必须**塞进框里**（inner），驱动件必须**紧贴框**才通电。
   */
  var SPECS = {
    /* 1-1「放个轮子」：纯重力下坡，不要任何动力件。
     * 教的是"框+轮+猪"这个最小可动体。 */
    '1-1': { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]], pig: [[4, 2]] },

    /* 1-2「推一把」：要有推力才能到终点。
     * 教的是**仙术机关**（手动件，不耗容量）—— 所以车上一个动力源都没有。
     * 这正好和 1-3 形成对照：那关才教动力源+驱动件。 */
    '1-2': { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]],
             pump: [[3, 2]], pig: [[4, 2]],
             _dirs: { pump: 0 },                                  // 机关朝右
             _presses: [{ t: 0.8, k: 'press' }, { t: 1.5, k: 'release' }] },

    /* 1-3「动力接上了吗」：教**动力源 + 驱动件 + 连通性**。
     *
     * ⚠ 一格只能塞一件内嵌件（`inner`）。风种和猪都要"放在框里"，
     * 所以必须占**两个不同的框**：风种进 c2、猪进 c1。
     * 第一版两件都写了 [[4,2]]，于是猪被拒（occupied）→ 车装不上。
     * 第三星是「动力余量 ≥ 1」，所以不能装第二个驱动件。 */
    '1-3': { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]],
             anemo_core: [[4, 2]], pig: [[4, 1]], propeller: [[3, 2]],
             _dirs: { propeller: 0 } },

    /* 1-4「冰面」：两个变体，靠轮子抓地通过。
     * 冰面上木轮几乎打滑（0.15），铁轮才有 0.8 —— 这一关教的就是换轮子。
     *
     * ⚠ 这里必须用**喷气口**（9 m/s²）而不是风车桨（5 m/s²），
     * 这是算出来的，不是试出来的：
     *   1-4 最陡的一段是 0.44 的冰坡（23.7°），G=16，
     *   沿坡的重力分量 = 16·sin(23.7°) = **6.44 m/s²**。
     *   风车桨只有 5.0 → 净加速度 -1.44，物理上**爬不上去**。
     *   喷气口 9.0 → 净 +2.56，能爬。
     * 第一版用风车桨，实测车在 x=11.98 停住（tools/dbg 里逐帧看到的
     * 就是 22.7° 处 vx → 0）。
     *
     * 资源上正好形成取舍：风种有 2 点容量，喷气口占 2 点 → 只能装一个，
     * 余量 0。而 1-3 用风车桨（占 1）留 1 点余量拿第三星 ——
     * 两关的容量算法因此不同，这就是"动力"这个系统的意义。 */
    '1-4i': { wood_frame: [[4, 1], [4, 2], [4, 3], [4, 4]],
              iron_wheel: [[5, 1], [5, 4]], anemo_core: [[4, 2]],
              pig: [[4, 1]], jet: [[3, 2]], _dirs: { jet: 0 } },
    '1-4w': { wood_frame: [[4, 1], [4, 2], [4, 3], [4, 4]],
              wood_wheel: [[5, 1], [5, 4]], anemo_core: [[4, 2]],
              pig: [[4, 1]], jet: [[3, 2]], _dirs: { jet: 0 } },

    /* 1-5「第一道坡」：第三星是「不用驱动件」。
     * 所以标准解故意**一个 tool 都没有** —— 靠仙术机关喷过去。
     * `1-5m` 是"装了驱动件所以拿不到第三星"的对照解。 */
    '1-5n': { wood_frame: [[4, 0], [4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 0], [5, 3]],
              pump: [[3, 1]], pig: [[4, 1]],
              _dirs: { pump: 0 },
              _presses: [{ t: 0.6, k: 'press' }, { t: 1.4, k: 'release' },
                         { t: 3.0, k: 'press' }, { t: 3.8, k: 'release' }] },
    '1-5m': { wood_frame: [[4, 0], [4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 0], [5, 3]],
              anemo_core: [[4, 2]], propeller: [[3, 2]], pig: [[4, 1]],
              _dirs: { propeller: 0 } },

    /* 1-6「抬个头」：教**浮力 + 配重 + 位置系挂**。
     *
     * ⚠ 这一关暴露过一次真设计漏洞（第 63 轮）：
     * 气球只提供**向上的力**，一点水平分量都没有。旧地形靠"先下坡"给初速
     * 所以还能跑；新地形起点是平的 → 车原地垂直起飞然后飞出地图
     * （实测 vx 恒为 0，fail=flew_away）。
     * 所以标准解必须同时带一个水平驱动件 —— 这正是参考里气球关的形态：
     * **气球管高度，螺旋桨管前进**。
     *
     * 摆位遵守系挂规则：
     *   · 热气球在框的**上方**（球 r=3、框 r=4）→ 系住
     *   · 压舱石在框的**下方**（框 r=4、石 r=5）→ 系住
     * 参数由 tools/gen_level_06_r63.js 搜出来：3 球 + 2 沙袋 @1.5s 扔，
     * 峰值 11.87 m（终点地表 7.71），**真的飞过去了**而不是贴地跑过去。 */
    '1-6': { wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]],
             balloon: [[3, 2]], sandbag: [[5, 2]],
             anemo_core: [[4, 1]], propeller: [[3, 1]], pig: [[4, 2]],
             _dirs: { propeller: 0 },
             _stacks: { balloon: 3, sandbag: 2 },
             _drops: [{ t: 1.5, n: 2 }] }
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
    /* `state.car` 可能是 null：`createRun` 在"车造不出来"时（空车、没猪、零件不连通）
     * 会提前把这一局判成 resolved 并 return，car 保持 null。
     * 少了这一句，任何"带方向的 spec + 造废了"的组合都会在这里抛
     * `Cannot read properties of null (reading 'parts')` ——
     * 而这条路恰好是**测试造失败局**最常用的入口（tools/probe_fail_reasons.js 撞到过）。
     * 车都不存在了，方向自然无处可写，直接返回才是对的。 */
    if (!state.car) return state;
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
    /* 第 71 轮：种子的触发时刻也走同一根时间轴。
     * `opts.seeds` 是给**测试**用的（spec 里的 `_seeds` 给标准解用），
     * 里面每条 {t, kind} —— kind 是 'anemo'/'geo'/'electro'。
     * ⚠ 必须调 triggerSeed，不能直接写 state 字段：写字段会让测试绿而实机红
     * （"一次性"「范围」这些规则都在 triggerSeed 里）。 */
    var seedActs = (opts.seeds || (spec && spec._seeds) || []);
    seedActs.forEach(function (a) {
      acts.push({ t: a.t, k: 'seed', kind: a.kind });
    });
    acts.sort(function (a, b) { return a.t - b.t; });
    var ai = 0;
    while (state.phase === 'run' && state.time < maxT) {
      while (ai < acts.length && acts[ai].t <= state.time) {
        if (acts[ai].k === 'drop') dropSandbag(state);
        else if (acts[ai].k === 'pop') popBalloon(state);
        else if (acts[ai].k === 'seed') triggerSeed(state, acts[ai].kind);
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
    /* 风/喷流的方向（对 blowsAir 零件与 dirVec 相反）。绘制箭头、风特效、
     * 以及以后的任何"风往哪吹"判断，都必须读这一个函数。 */
    blowVec: blowVec,
    PARTS: PARTS, TRAY_ORDER: TRAY_ORDER, DEFAULTS: DEFAULTS, Params: Params,
    BUILD_COLS: BUILD_COLS, BUILD_ROWS: BUILD_ROWS, CELL: CELL,
    /* 车身在网格里的锚点行（常量）。测试要能断言"行数变了但锚点没变"。 */
    BUILD_ANCHOR_ROW: BUILD_ANCHOR_ROW,
    resetParams: resetParams, makeTerrain: makeTerrain,
    newBuild: newBuild, tryPlace: tryPlace, canPlace: canPlace, removeAt: removeAt, undo: undo,
    dropHistory: dropHistory, pushHistory: pushHistory, rotateAt: rotateAt, clearBuild: clearBuild, budgetLeft: budgetLeft,
    interactiveCount: interactiveCount, buildVehicle: buildVehicle,
    /* 第 63 轮新机制：动力图与系挂校验。测试要能直接调它们，
     * 否则"连通/系挂"只能通过 buildVehicle 的间接读数验证。 */
    /* 第 71 轮新机制：种子三兄弟。`powerGrid` 已删 —— 动力容量系统不存在了，
     * 留着这个导出只会让人以为还有"连通性"这回事。 */
    triggerSeed: triggerSeed, groundY: groundY, tetherCheck: tetherCheck,
    createRun: createRun, step: step, stepLoose: stepLoose, damageCar: damageCar, setBrake: setBrake, pressInteract: pressInteract,
    pressInteract: pressInteract,
    releaseInteract: releaseInteract, cancelInteract: cancelInteract, challengePass: challengePass,
    popBalloon: popBalloon, dropSandbag: dropSandbag, tapAt: tapAt, syncCarMass: syncCarMass,
    recomputeLift: recomputeLift, cellCount: cellCount,
    SPECS: SPECS, applySpec: applySpec, applySpecRuntime: applySpecRuntime,
    simulate: simulate, partPos: partPos
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RAP;
  else root.RAP = RAP;
})(typeof globalThis !== 'undefined' ? globalThis : this);

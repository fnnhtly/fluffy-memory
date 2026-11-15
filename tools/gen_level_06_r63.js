/* 第 63 轮 v2：生成 1-6 地形 —— 这次先算清楚再画。
 *
 * ── 前两次为什么不行（都记下来，别再试） ──
 * v1（手写 ASCII）：起点直接接 -2.55 的陡坡，车一出发就被吃掉，x=1.5 卡死。
 * v2（参数化折线）：起点平了，但**气球只给垂直力、一点水平分量都没有**，
 *    所以车原地不动 —— x 从 1.50 到 1.60 就停了。
 *    这一条是概念性的：旧 1-6 能跑是因为"先下坡再抬头"，靠重力给初速。
 *    解法是给这关配一个水平驱动件（风车桨），气球只管高度。
 * v3（加了驱动件）：能跑到 x=9.99，但落进沟里，撞击 4.7 → 木框全碎 → 猪掉出来。
 *    原因是沟**太深太陡**：车以水平速度冲过去时，沟壁是垂直的。
 *
 * ── 这一版的形状原则 ──
 * 1. 起点平台平、且**够长**（col 0~6），让车先把水平速度建起来；
 * 2. 沟的**入口缓、出口缓**（都 ≤ 0.35 的坡），不要垂直壁 ——
 *    气球车的水平速度只有 2~3 m/s，垂直壁等于要它悬停；
 * 3. 沟底高度只比起点低 2 米（不是 4 米），落进去也不至于砸碎；
 * 4. 终点平台比沟底高 3 米 —— 必须真的飞起来才过得了。
 *
 * 另外这个脚本会**搜索**标准解参数（升力、沙袋数、扔的时机），
 * 只有搜到能通关的组合才写文件。这样"这关可解"是被证明的。
 */
const R = require('../prototype/game.js');
const fs = require('fs');
const path = require('path');

const COLS = 44, ROWS = 18;

/* 用"地表在不同列的实心高度"定义地形，再填 ASCII。
 * h = 从底部往上数几格实心。
 *
 * ── 形状原则（每一条都是被失败教出来的）──
 * 1) 起点平台平且够长（col 0~7），让风车桨先把水平速度建起来；
 * 2) 沟口**缓降**、沟底平、出口**缓升** —— 不要垂直崖壁。
 * 3) 🚨 **终点必须高到"不飞就上不去"**。
 *    这是 v5 才想明白的一条：前面几版的终点只比起点高 1~2 格，
 *    于是"风车桨一路推过去"就能赢 —— 实测标准解 maxY=5.85，
 *    而终点地表 4.43，车**从来没离开过地面**。
 *    那样这一关教的是"装个桨"，不是"抬头"。
 *    现在终点台比起点高 6 格，坡度上到 ~1.4（轮子抓不住），
 *    必须真的浮起来才够得着。
 * 4) 高台之后不要再一路铺满，否则"飞上去"又会退化成"爬上去"。
 */
function heightAt(c) {
  if (c <= 7) return 4;                      // 起点平台（平、够长）
  if (c <= 10) return 4 - (c - 7) * 0.55;    // 缓降 4.0 → 2.35
  if (c <= 13) return 2.35;                  // 沟底（平、够长，落地不打滑）
  /* 爬升段必须**够缓**：斜率控制在 0.75 以内（约 37°）。
   * 第一版这里是 0.5/格 → 实际坡度 1.44（55°），气球车水平只有 2~3 m/s，
   * 撞上去 vn=7.67 远超 damageMin(4.5)，标准解自己把木框撞裂 ——
   * tools/test_touch_ladder 报「1-6 掉耐久 1」。
   *
   * 现在进一步把沟底拉长（10→13 共 3 格），让车有**落地→再爬**的缓冲。
   * 这仍然是几何解法而不是阈值解法：damageMin 是"正确打法不该被误伤"
   * 的保障，为了单关的几何去动它，会把整条触地档位的对齐关系破坏掉。 */
  if (c <= 19) return 2.35 + (c - 13) * 0.72; // 缓升 2.35 → 6.67（6 格）
  return 10.0;                               // 终点高台
}

function makeMap() {
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill('.'));
  for (let c = 0; c < COLS; c++) {
    const h = Math.max(1, Math.min(ROWS - 8, Math.round(heightAt(c))));
    for (let r = ROWS - h; r < ROWS; r++) grid[r][c] = '#';
  }
  // 起点、终点、木箱（都放在地表上方一格）
  const surfRow = c => ROWS - Math.max(1, Math.min(ROWS - 8, Math.round(heightAt(c)))) - 1;
  grid[surfRow(1)][1] = 'S';
  grid[surfRow(15)][15] = 'E';
  grid[surfRow(19)][19] = 'B';  return grid.map(row => row.join(''));
}

const mapRows = makeMap();

const lv = {
  levelId: '1-6',
  name: '抬个头',
  /* biome 用独立的 `sky`（第 63 轮）：1-6 原来和 1-5 共享 `dusk`，
   * 两张缩略图平均色只差 17（阈值 18），选关页上分不出谁是谁。
   * 而 1-6 是"抬头"关，本来就该有一片更亮更开阔的天。 */
  biome: 'sky',
  grid: { cols: COLS, rows: ROWS },
  start: { col: 1 },
  goal: { col: 15 },
  hardCols: [],
  /* partsBox 必须同时给：
   *   · anemo_core + propeller —— 水平推力（气球只给垂直力，不给水平力，
   *     这条是 v2 撞墙后才发现的：没有它车只会原地垂直起飞，vx 恒为 0）
   *   · balloon ×3 —— 升力
   *   · sandbag ×3 —— 配重（起飞时压住，飞到高处再扔） */
  partsBox: { wood_frame: 3, wood_wheel: 2, anemo_core: 1, propeller: 2,
              balloon: 3, sandbag: 3, pig: 1 },
  mapRows: mapRows,
  materials: [
    { cols: [0, 9], type: 'mud' },
    { cols: [10, 43], type: 'stone' }
  ],
  /* 木箱位置必须落在**车真的贴近地面**的列上，否则永远拿不到。
   *
   * 1-6 的车是"起飞→飞过高台"的轨迹：实测车身贴地（|y − 地表| < 1.7）
   * 只在 col 1~5 和 14~15。第一版把箱子放在 col 19（高台之后），
   * 车从 5.8 米高处飞过，箱子在 3.04 米 —— 差 2.8 米，
   * 拾取半径 1.7 打不到，于是标准解永远 ★2。
   *
   * 放 col 4：起步加速段，一定经过，而且"顺手捡"比"专门去够"更像正常关。 */
  boxes: [{ col: 4, row: 7 }],
  challenge: { type: 'allSandbags' },
  timeLimit: 120
};

console.log('地表：');
const ter = R.makeTerrain(lv);
for (let c = 0; c <= 20; c++) {
  console.log('  col ' + String(c).padStart(2) + ' y=' + ter.surfaceY(c + 0.5).toFixed(2) +
              ' slope=' + ter.surfaceSlope(c + 0.5).toFixed(2));
}

/* 搜索：升力 × 沙袋数 × 扔的时刻
 *
 * ⚠ 判据不只是"赢了"，还要**真的飞起来过**。
 * 前面几版只判 win，于是搜出来的"最优解"是风车桨推着车在平地上开过去，
 * maxY 从来没超过终点地表 —— 那是"装了桨"，不是"抬个头"。
 * 现在额外要求 peak 比终点地表高 at least 0.8 米。 */
const origLift = R.PARTS.balloon.liftMass;
let best = null;
const tries = [];
const goalSurf = R.makeTerrain(lv).surfaceY(lv.goal.col + 0.5);
console.log('终点地表高度 ' + goalSurf.toFixed(2) + '，要求飞行峰值至少超过它 0.8 m');

function flightPeak(spec) {
  const b = R.newBuild();
  R.applySpec(lv, b, spec);
  const st = R.createRun(lv, b);
  if (R.applySpecRuntime) R.applySpecRuntime(st, spec);
  let peak = -1e9;
  for (let i = 0; i < 60 * 60; i++) {
    R.step(st, 1 / 60);
    if (st.car.y > peak) peak = st.car.y;
    if (st.result) break;
  }
  return { peak, result: st.result, time: st.time };
}

/* 升力现在从 1.2 提到 3.2（PARTS.balloon，见 game.js 里那段推导：
 * 车 9.35 kg，3 球 × 3.2 = 9.6 才抬得起来）。
 * 搜索范围因此上移 —— 扫 3.2 附近，看哪一档"刚好浮、又能爬"。 */
for (const lm of [3.2, 3.5, 3.8, 4.2]) {
  R.PARTS.balloon.liftMass = lm;
  for (const bags of [2, 3]) {
    for (const dropT of [1.5, 2.5, 3.5, 4.5, 5.5]) {
      const spec = {
        wood_frame: [[4, 1], [4, 2], [4, 3]], wood_wheel: [[5, 1], [5, 3]],
        balloon: [[3, 2]], sandbag: [[5, 2]],
        anemo_core: [[4, 1]], propeller: [[3, 1]], pig: [[4, 2]],
        _dirs: { propeller: 0 },
        _stacks: { balloon: 3, sandbag: bags },
        _drops: [{ t: dropT, n: bags }]
      };
      try {
        const f = flightPeak(spec);
        const flew = f.peak > goalSurf + 0.8;
        tries.push({ lm, bags, dropT, res: f.result, x: f.peak, flew });
        if (f.result === 'win' && flew) {
          if (!best || f.time < best.t) best = { lm, bags, dropT, t: f.time, spec, peak: f.peak };
        }
      } catch (e) { tries.push({ lm, bags, dropT, res: 'EXC:' + e.message }); }
    }
  }
}
R.PARTS.balloon.liftMass = origLift;

/* 打印"最远的 5 次"，并明确区分"赢了但没飞"与"真飞了" */
const flewWins = tries.filter(t => t.res === 'win' && t.flew);
const dryWins = tries.filter(t => t.res === 'win' && !t.flew);
console.log('');
console.log('赢了的组合：真飞过 ' + flewWins.length + ' 个，只在地面跑过去 ' + dryWins.length + ' 个');
const top = tries.filter(t => t.x > -1e8).sort((a, b) => b.x - a.x).slice(0, 5);
top.forEach(t => console.log('  峰值 ' + t.x.toFixed(2) + '  lift=' + t.lm +
  ' bags=' + t.bags + ' drop@' + t.dropT + ' → ' + t.res +
  (t.flew ? '  [飞过]' : '  [没飞]')));

console.log('');
if (!best) {
  console.log('✗ 没有任何组合通关 —— 地形仍需调整');
  /* 仍然写出地形（方便下一轮继续调），但标记失败 */
  fs.writeFileSync(path.join(__dirname, '..', 'levels', '06.json'),
                   JSON.stringify(lv, null, 2) + '\n', 'utf8');
  process.exit(1);
}
console.log('✓ 可解：liftMass=' + best.lm + ' 沙袋=' + best.bags +
            ' 扔@' + best.dropT + 's → win t=' + best.t.toFixed(2) + 's');
fs.writeFileSync(path.join(__dirname, '..', 'levels', '06.json'),
                 JSON.stringify(lv, null, 2) + '\n', 'utf8');
console.log('06.json 已写入');
console.log('SPEC：' + JSON.stringify(best.spec));

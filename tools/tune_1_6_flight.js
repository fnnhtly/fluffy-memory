/* 1-6「抬个头」—— 飞越沟的关卡调参台（手选剖面 + 二维时刻扫描）。
 *
 * 为什么不用盲扫网格：地形和时机是**耦合**的，盲扫 72 组里 0 组合格，
 * 因为大多数组合连"车能不能起步"都没过（滚动阻力 0.14，缓坡起不来）。
 * 先把车能动这件事钉死，再扫时机。
 *
 * 关卡结构（GROUND 行 = 地面基准，height = ROWS − topRow）：
 *   c0..c2   从 row8 陡降到 row12   ← 出生就在坡上，保证能动起来
 *   c3..c12  row12 平坦助跑 10 米
 *   c13..c20 沟（8 列整列空，真·4 米深）
 *   c21..    row12 对岸，然后缓下坡滚向终点
 *
 * 玩法（这就是要教的东西）：
 *   1. 带着沙袋 → 净重为正 → 压在地上，能一路滚到崖口
 *   2. 崖口扔沙袋 → 净重转负 → 以 2.5 m/s 上升，越过沟
 *   3. 过沟后扎气球 → 落回地面 → 滚到终点
 * 三个动作缺一个都过不去（沙袋是起飞开关，气球是油门兼刹车）。
 */
const R = require('../prototype/game.js');

const COLS = 48, ROWS = 16, GROUND = 12;

function buildMap(profile) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) rows.push(new Array(COLS).fill('.'));
  for (let c = 0; c < COLS; c++) {
    const top = profile[c];
    if (top === undefined) continue;
    for (let r = top; r < ROWS; r++) rows[r][c] = '#';
  }
  return rows.map(r => r.join(''));
}

/* 手写剖面：{ 列号: topRow } 或 { 列号: [起, 止, topRow] } */
function expand(cfg) {
  const p = {};
  for (const k of Object.keys(cfg)) {
    const v = cfg[k];
    if (Array.isArray(v)) for (let c = v[0]; c <= v[1]; c++) p[c] = v[2];
    else p[Number(k)] = v;
  }
  return p;
}

function makeLevel(seg) {
  const p = expand(seg.map);
  const mapRows = buildMap(p);
  const hard = [];
  for (let k = seg.edge - 1; k <= seg.edge + seg.gapW; k++) hard.push(k);
  const farTop = seg.map['f' + seg.edge + '-' + (seg.edge + seg.gapW + 1)] || 0;
  return {
    levelId: '1-6', name: '抬个头', chapter: 1, biome: 'dusk',
    grid: { cols: COLS, rows: ROWS, cell: 1.0, px: 32 },
    buildArea: { cols: 6, rows: 8 },
    start: { col: 1, row: 4 },
    goal: { col: seg.goalCol, row: 6 },
    hardCols: hard,
    physics: { gravity: 16.0, stepHz: 60, subSteps: 4, friction: { mud: 0.6, stone: 0.45, ice: 0.05 } },
    partsBox: { wood_frame: 3, wood_wheel: 2, balloon: 6, sandbag: 3, pig: 1 },
    mapRows: mapRows,
    materials: [
      { surfaceRow: GROUND, cols: [0, seg.edge], type: 'mud' },
      { surfaceRow: GROUND, cols: [seg.edge + seg.gapW + 1, COLS - 1], type: 'stone' }
    ],
    boxes: [],
    _edge: seg.edge, _goalCol: seg.goalCol, _gapW: seg.gapW
  };
}

function stackInto(lv, b, part, r, c, n) {
  const key = r + ',' + c;
  if (!R.tryPlace(lv, b, part, r, c).ok) return 0;
  let have = R.cellCount(b.cells[key]);
  while (have < Math.min(n, R.PARTS[part].maxStack || 3)) {
    const r2 = R.tryPlace(lv, b, part, r, c);
    if (!r2.ok) break;
    const got = R.cellCount(b.cells[key]);
    if (got <= have) break;
    have = got;
  }
  return have;
}

/* 3 框第 1/2/3 列 + 木轮 1/3 列 + 猪居中。必须这么摆：绕原点旋转且重力不过原点，
 * 0/1/2 列摆法两块轮子的力矩同向、无人抵消，车会慢慢倒扣。 */
function makeCar(lv, opt) {
  R.resetParams();
  const b = R.newBuild();
  for (const c of [1, 2, 3]) R.tryPlace(lv, b, 'wood_frame', 4, c);
  R.tryPlace(lv, b, 'wood_wheel', 5, 1);
  R.tryPlace(lv, b, 'wood_wheel', 5, 3);
  R.tryPlace(lv, b, 'pig', 4, 2);
  let want = opt.balloons || 0;
  for (const c of [1, 2, 3]) { if (want <= 0) break; want -= stackInto(lv, b, 'balloon', 3, c, Math.min(3, want)); }
  if (opt.sandbags) stackInto(lv, b, 'sandbag', 5, 2, opt.sandbags);
  return b;
}

/* schedule: [{t, do:'drop'|'pop', n}] */
function run(lv, b, schedule, maxt) {
  const st = R.createRun(lv, b);
  const sc = (schedule || []).slice().sort((a, c) => a.t - c.t);
  let maxX = -99, maxY = -99, minYAfter = 99;
  for (let i = 0; i < 60 * (maxt || 20); i++) {
    if (st.phase !== 'run') break;
    while (sc.length && st.time >= sc[0].t) {
      const a = sc.shift();
      const n = a.n || 1;
      for (let k = 0; k < n; k++) {
        if (a.do === 'drop') R.dropSandbag(st);
        else R.popBalloon(st);
      }
    }
    R.step(st, 1 / 60);
    maxX = Math.max(maxX, st.car.x);
    maxY = Math.max(maxY, st.car.y);
  }
  return { st, maxX, maxY, res: st.result || st.failReason || 'running',
    pops: st.balloonPops, dropped: st.sandbagsDropped, net: st.car.netMass,
    x: st.car.x, y: st.car.y, t: st.time };
}

module.exports = { makeLevel, makeCar, run, stackInto, R, COLS, ROWS, GROUND, buildMap };

if (require.main === module) {
  const SEG = {
    edge: 13, gapW: 8, goalCol: 30,
    map: {
      0: 8, 1: 9, 2: 10, 3: 11, 4: 12,
      '5-12': [5, 12, 12],
      '13-12': [13, 20, undefined],   // 沟（下面 expand 会跳过 undefined）
      '21-27': [21, 27, 12],
      '28-32': [28, 32, 13],
      '33-47': [33, 47, 14]
    }
  };
  // undefined 段不会写进 profile = 整列空 = 沟；用显式删除保证可读
  delete SEG.map['13-12'];

  const lv = makeLevel(SEG);
  const ter = R.makeTerrain(lv);
  console.log('剖面：');
  lv.mapRows.forEach((s, i) => console.log(String(i).padStart(2) + ' ' + s.slice(0, 36)));
  console.log('地表高度：' + Array.from({ length: 36 }, (_, c) => ter.surfaceY(c + 0.5).toFixed(1)).join(' '));

  // ── 1. 先确认真能动起来 ──
  console.log('\n=== 只带沙袋（3 袋，无气球）：能不能滚到崖口 ===');
  {
    const l2 = makeLevel(SEG); l2.partsBox.balloon = 0;
    const r = run(l2, makeCar(l2, { balloons: 0, sandbags: 3 }), null, 20);
    console.log(`  ${r.res}  x=${r.x.toFixed(2)} maxX=${r.maxX.toFixed(2)} t=${r.t.toFixed(1)}`);
    const tr = [];
    for (let i = 0; i < 60 * 12; i++) {
      R.step(r.st, 0);  // 不再推进
      break;
    }
  }

  // ── 2. 逐秒打印轨迹探索 ──
  console.log('\n=== 轨迹（3 沙袋，不扔） ===');
  {
    const l2 = makeLevel(SEG); l2.partsBox.balloon = 0;
    const st = R.createRun(l2, makeCar(l2, { balloons: 0, sandbags: 3 }));
    console.log(`  spawn x=${st.car.x.toFixed(2)} y=${st.car.y.toFixed(2)} mass=${st.car.mass.toFixed(2)}`);
    for (let i = 0; i < 60 * 12 && st.phase === 'run'; i++) {
      R.step(st, 1 / 60);
      if (i % 30 === 0) console.log(`   t=${st.time.toFixed(1)} x=${st.car.x.toFixed(2)} y=${st.car.y.toFixed(2)} vx=${st.car.vx.toFixed(2)} a=${st.car.a.toFixed(2)}`);
    }
    console.log(`   → ${st.result || 'running'} / ${st.failReason} x=${st.car.x.toFixed(2)}`);
  }

  // ── 3. 气球 + 沙袋：扫投放时刻 ──
  console.log('\n=== 带 6 气球 3 沙袋，扫"什么时候扔沙袋" ===');
  const wins = [];
  for (let dt = 0.5; dt <= 6.01; dt += 0.1) {
    const l3 = makeLevel(SEG);
    const r = run(l3, makeCar(l3, { balloons: 6, sandbags: 3 }),
      [{ t: dt, do: 'drop', n: 3 }], 20);
    const tag = `扔@${dt.toFixed(1)}`;
    if (r.res === 'win') wins.push(dt);
    if (Math.abs(dt * 10 % 5) < 0.01 || r.res === 'win') {
      console.log(`  ${tag.padEnd(9)} ${String(r.res).padEnd(9)} x=${r.x.toFixed(2).padStart(6)} maxX=${r.maxX.toFixed(1).padStart(5)} 破=${r.pops} 净=${r.net.toFixed(2)}`);
    }
  }
  console.log(`  可过窗口 ${wins.length} 个：${wins.map(w => w.toFixed(1)).join(',') || '无'}`);

  // ── 4. 三格判定：只气球 / 只沙袋 / 都有不扔 ──
  console.log('\n=== 三格判定 ===');
  {
    const a = makeLevel(SEG); a.partsBox.sandbag = 0;
    const ra = run(a, makeCar(a, { balloons: 6, sandbags: 0 }), null, 20);
    console.log(`  A 只带气球   ${String(ra.res).padEnd(9)} x=${ra.x.toFixed(2)} maxX=${ra.maxX.toFixed(1)}`);
    const b2 = makeLevel(SEG); b2.partsBox.balloon = 0;
    const rb = run(b2, makeCar(b2, { balloons: 0, sandbags: 3 }), null, 20);
    console.log(`  B 只带沙袋   ${String(rb.res).padEnd(9)} x=${rb.x.toFixed(2)} maxX=${rb.maxX.toFixed(1)}`);
    const c = makeLevel(SEG);
    const rc = run(c, makeCar(c, { balloons: 6, sandbags: 3 }), null, 20);
    console.log(`  C 都有不扔   ${String(rc.res).padEnd(9)} x=${rc.x.toFixed(2)} maxX=${rc.maxX.toFixed(1)}`);
    const d = makeLevel(SEG);
    const rd = run(d, makeCar(d, { balloons: 6, sandbags: 3 }), [{ t: 2.4, do: 'drop', n: 3 }], 20);
    console.log(`  D 扔@2.4     ${String(rd.res).padEnd(9)} x=${rd.x.toFixed(2)} maxX=${rd.maxX.toFixed(1)} 破=${rd.pops}`);
  }
}

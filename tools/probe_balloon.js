/* 气球/沙袋的能力边界 —— 设计关卡之前必须知道的事实。
 *
 * 三个问题：
 *   1. 每个气球能举起多少 kg（现在写成 1.2，是真的吗？）
 *   2. 净浮力为负时车怎么上升（终端速度、会不会飞出地图）
 *   3. 沙袋能压住多少、扔掉的瞬间质量真的降了吗
 *
 * 注意两个坑（都踩过）：
 *   - 可叠零件是"再点同一格 → +1，到 3 回绕到 1"，所以要看 tryPlace 返回的 n，
 *     不能盲点 n 次（点 4 次得到的是 1 个，不是 4 个）；
 *   - 气球/沙袋必须贴着结构件，且目标格不能已被占用 ——
 *     (5,2) 有轮子就放不进去，而失败的 tryPlace 不会报错到 stdout，
 *     只会让后面的数字全都变成"没效果"。
 */
const R = require('../prototype/game.js');
const L1 = require('../levels/01.json');

function mk(extra) {
  const lv = JSON.parse(JSON.stringify(L1));
  lv.partsBox = Object.assign({ wood_frame: 4, wood_wheel: 2, pig: 1 }, extra);
  return lv;
}

/* 找一格空闲的、且贴着结构件的位置 */
function freeCell(b, r0, c0, avoid) {
  const cand = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const r = r0 + dr, c = c0 + dc;
    if (r < 0 || r >= R.BUILD_ROWS || c < 0 || c >= R.BUILD_COLS) continue;
    const k = r + ',' + c;
    if (b.cells[k]) continue;
    if (avoid && avoid.indexOf(k) >= 0) continue;
    // 必须贴着结构件
    let touch = false;
    for (const [dr2, dc2] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nb = b.cells[(r + dr2) + ',' + (c + dc2)];
      if (nb && R.PARTS[nb.part].structure) touch = true;
    }
    if (touch) cand.push({ r, c });
  }
  return cand;
}

function stack(lv, b, part, r, c, n) {
  let got = 0;
  for (let i = 0; i < 14; i++) {
    const res = R.tryPlace(lv, b, part, r, c);
    if (!res.ok) return { ok: false, reason: res.reason, got };
    got = R.cellCount(b.cells[r + ',' + c]);
    if (got >= n) return { ok: true, got };
  }
  return { ok: got >= n, got };
}

/* 3 框横排 + 两端轮 + 猪在中间 = 标准车（6.3 kg） */
function stdCar(lv) {
  R.resetParams();
  const b = R.newBuild();
  [[4, 1], [4, 2], [4, 3]].forEach(([r, c]) => R.tryPlace(lv, b, 'wood_frame', r, c));
  [[5, 2], [5, 3]].forEach(([r, c]) => R.tryPlace(lv, b, 'wood_wheel', r, c));
  R.tryPlace(lv, b, 'pig', 4, 2);
  return b;
}
/* 1 框 + 2 轮 + 猪 = 最轻的车（3.9 kg） */
function lightCar(lv) {
  R.resetParams();
  const b = R.newBuild();
  R.tryPlace(lv, b, 'wood_frame', 4, 2);
  R.tryPlace(lv, b, 'wood_wheel', 5, 1);
  R.tryPlace(lv, b, 'wood_wheel', 5, 3);
  R.tryPlace(lv, b, 'pig', 4, 2);
  return b;
}

function fly(lv, b, t) {
  const st = R.createRun(lv, b);
  const car = st.car;
  const trace = [];
  let maxY = -1e9, maxV = 0;
  for (let i = 0; i < Math.round(t * 60) && st.phase === 'run'; i++) {
    R.step(st, 1 / 60);
    if (i % 30 === 0) trace.push({ t: +st.time.toFixed(1), y: +car.y.toFixed(2), vy: +car.vy.toFixed(2) });
    maxY = Math.max(maxY, car.y);
    maxV = Math.max(maxV, Math.hypot(car.vx, car.vy));
  }
  return { st, car, trace, maxY, maxV, popped: st.balloonPops };
}

console.log('=== 两种车的基准质量 ===');
{
  const lv = mk({});
  const s = R.buildVehicle(lv, stdCar(lv));
  const l = R.buildVehicle(lv, lightCar(lv));
  console.log(`  标准车(3框+2轮+猪) ${s.mass.toFixed(2)} kg，其中猪 1.5 / 框 3.6 / 轮 1.2`);
  console.log(`  最轻车(1框+2轮+猪) ${l.mass.toFixed(2)} kg，其中猪 1.5 / 框 1.2 / 轮 1.2`);
}

console.log('\n=== 要几个气球才飘得起来（liftMass=1.2）===');
for (const [name, mkCar] of [['标准车', stdCar], ['最轻车', lightCar]]) {
  for (let n = 1; n <= 9; n++) {
    const lv = mk({ balloon: 9 });
    const b = mkCar(lv);
    // 气球挂在框上方那一行
    const spots = freeCell(b, 4, 2);
    if (!spots.length) { console.log('  没地方挂'); break; }
    let need = n;
    for (const sp of spots) {
      if (need <= 0) break;
      const g = stack(lv, b, 'balloon', sp.r, sp.c, Math.min(3, need));
      need -= g.got;
    }
    const car = R.buildVehicle(lv, b);
    if (car.liftMass < n * 1.2 - 0.01) { console.log(`  ${name} ${n} 个：放不下`); break; }
    const flies = car.netMass < 0;
    console.log(`  ${name} ${n} 个  mass=${car.mass.toFixed(2)} lift=${car.liftMass.toFixed(2)} ` +
      `net=${car.netMass.toFixed(2)}${flies ? '  ← 会飘' : ''}`);
    if (flies) break;
  }
}

console.log('\n=== 飞起来之后：上升速度 / 会不会飞出地图（最轻车 3 个气球）===');
{
  const lv = mk({ balloon: 9 });
  const b = lightCar(lv);
  const sp = freeCell(b, 4, 2)[0];
  stack(lv, b, 'balloon', sp.r, sp.c, 3);
  const car = R.buildVehicle(lv, b);
  console.log(`  mass=${car.mass.toFixed(2)} lift=${car.liftMass.toFixed(2)} net=${car.netMass.toFixed(2)}`);
  const r = fly(lv, b, 6);
  console.log('  ' + r.trace.map(p => `t${p.t}:y${p.y}/vy${p.vy}`).join(' '));
  console.log(`  最高 y=${r.maxY.toFixed(2)}  maxV=${r.maxV.toFixed(1)}  结果=${r.st.result || r.st.failReason || '仍在跑'}`);
}

console.log('\n=== 沙袋压配重：最轻车 + 3 气球（lift 3.6）===');
for (const bags of [0, 1, 2, 3]) {
  const lv = mk({ balloon: 9, sandbag: 6 });
  const b = lightCar(lv);
  const sp = freeCell(b, 4, 2)[0];
  stack(lv, b, 'balloon', sp.r, sp.c, 3);
  if (bags > 0) {
    const sp2 = freeCell(b, 4, 2, [sp.r + ',' + sp.c])[0];
    if (sp2) stack(lv, b, 'sandbag', sp2.r, sp2.c, bags);
  }
  const car = R.buildVehicle(lv, b);
  const r = fly(lv, b, 4);
  console.log(`  ${bags} 袋(实际 ${car.sandbagCount}): mass=${car.mass.toFixed(2)} net=${car.netMass.toFixed(2)}` +
    `  4 秒后 y=${r.trace[r.trace.length - 1].y}  最高 ${r.maxY.toFixed(2)}  破 ${r.popped}`);
}

console.log('\n=== 扔沙袋的瞬间：质量 / 净重 / 自由体 ===');
{
  const lv = mk({ sandbag: 6 });
  const b = stdCar(lv);
  const sp = freeCell(b, 4, 2)[0];
  stack(lv, b, 'sandbag', sp.r, sp.c, 3);
  const st = R.createRun(lv, b);
  const snap = () => `mass=${st.car.mass.toFixed(2)} net=${st.car.netMass.toFixed(2)} bags=${st.car.sandbagCount}`;
  console.log('  扔之前 ' + snap());
  const oks = [];
  for (let i = 0; i < 4; i++) { oks.push(R.dropSandbag(st)); }
  console.log('  连扔四次 = ' + oks.join(',') + ' → ' + snap());
  console.log(`  sandbagsDropped=${st.sandbagsDropped} 自由体=${st.loose.length}`);
}

console.log('\n=== 扎气球 ===');
{
  const lv = mk({ balloon: 9 });
  const b = lightCar(lv);
  const sp = freeCell(b, 4, 2)[0];
  stack(lv, b, 'balloon', sp.r, sp.c, 3);
  const st = R.createRun(lv, b);
  const seq = [];
  for (let i = 0; i < 4; i++) seq.push(`${R.popBalloon(st) ? 'ok' : 'no'}(lift=${st.car.liftMass.toFixed(2)})`);
  console.log('  ' + seq.join(' → ') + `  pops=${st.balloonPops}`);
}

console.log('\n=== 气球碰地自动扎破（挂在大梁正下方，出生即贴地）===');
{
  const lv = mk({ balloon: 9 });
  const b = lightCar(lv);
  // (5,2) 是轮子那行的中间格，空着；出生时贴地
  const res = R.tryPlace(lv, b, 'balloon', 5, 2);
  console.log(`  放 (5,2) → ${res.ok ? 'ok' : res.reason}`);
  const r = fly(lv, b, 1.2);
  console.log(`  破 ${r.popped} 个，剩余 lift=${r.car.liftMass.toFixed(2)}`);
  console.log('  ' + (r.st.events.filter(e => /balloon|burst/.test(e)).slice(0, 4).join(' | ') || '（无事件）'));
}

console.log('\n=== 上涨速度是否被 liftMaxRise 封住（气球的规则简化）===');
{
  const lv = mk({ balloon: 9 });
  const b = lightCar(lv);
  const sp = freeCell(b, 4, 2)[0];
  stack(lv, b, 'balloon', sp.r, sp.c, 3);
  const st = R.createRun(lv, b);
  const vs = [];
  for (let i = 0; i < 300; i++) { R.step(st, 1 / 60); if (i % 60 === 0) vs.push(st.car.vy.toFixed(2)); }
  console.log('  每秒末 vy: ' + vs.join(' → ') + `  （上限 Params.liftMaxRise=${R.Params.liftMaxRise}）`);
}

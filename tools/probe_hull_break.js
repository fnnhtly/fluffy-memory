/* 扫一遍 1-1 的合法造法：木框到底会不会碎、猪到底会不会被弹出去。
 *
 * 为什么必须先量这件事：
 *   我们刚把 1-1 的第三颗星改成「不散架 KRAK SNAP」（照 docs/reference-badpiggies.md §6
 *   里参考最经典的那颗星）。但如果这一关**根本没有能撞碎木框的造法**，
 *   那这颗星就是白送的 —— 白送的星比没有星更糟，它会让整个三星体系失去意义。
 *
 * 顺带确认一个死代码：maxSpeed = 12，而 damageCar 里 vn > 14 才算"重击"（扣 2 点）。
 *   12 < 14，这一档永远进不去。要么把档位改成相对 maxSpeed 的比值，
 *   要么就说清楚它只是留给以后更高速度的关卡占位 —— 不能装作它在工作。
 */
const RAP = require('../prototype/game.js');
const L = require('../prototype/levels.js');
const lv = L[0];

const spec = RAP.SPECS['1-1'];
let rnd = 12345;
const rand = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;

// 用零件箱允许的数量随机撒：木框 3、木轮 2、猪 1
const BOX = lv.partsBox;
const stats = { n: 0, broken: 0, ejected: 0, lostHp: 0, win: 0, fail: 0, none: 0 };
const examples = { broken: [], ejected: [], lostHp: [] };

for (let t = 0; t < 400; t++) {
  const b = RAP.newBuild();
  const cells = [];
  const pick = (n, tries) => {
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < tries; k++) {
        const r = Math.floor(rand() * 8), c = Math.floor(rand() * 6);
        if (cells.some(q => q[0] === r && q[1] === c)) continue;
        cells.push([r, c]); break;
      }
    }
  };
  pick(BOX.wood_frame || 0, 40);
  const frames = cells.slice();
  pick(BOX.wood_wheel || 0, 40);
  const pigCell = cells.length ? cells[frames.length % frames.length] : null;
  if (!frames.length) continue;
  // 猪塞进第一个木框（合法：中空木框能装猪）
  const spec2 = { wood_frame: frames, wood_wheel: cells.slice(frames.length) };
  const pc = frames[0];
  spec2.pig = [[pc[0], pc[1]]];
  let st;
  try { st = RAP.simulate(lv, spec2, { maxTime: 70 }); } catch (e) { continue; }
  if (!st) continue;
  stats.n++;
  if (st.result === 'win') stats.win++; else if (st.result === 'fail') stats.fail++; else stats.none++;
  if (st.hullBroken) { stats.broken++; if (examples.broken.length < 3) examples.broken.push(JSON.stringify(spec2)); }
  if (st.pigEjected) { stats.ejected++; if (examples.ejected.length < 3) examples.ejected.push(JSON.stringify(spec2)); }
  const fr = st.car ? st.car.parts.filter(p => p.def.structure) : [];
  if (fr.some(p => p.hp < 3)) { stats.lostHp++; if (examples.lostHp.length < 3) examples.lostHp.push(JSON.stringify(spec2) + ' hp=' + fr.map(p => p.hp).join(',')); }
}

console.log('1-1 随机造法扫描：' + stats.n + ' 种');
console.log('  通关 ' + stats.win + ' / 失败 ' + stats.fail + ' / 未结束 ' + stats.none);
console.log('  木框碎了      ' + stats.broken + '  (' + (100 * stats.broken / stats.n).toFixed(1) + '%)');
console.log('  猪被弹出去    ' + stats.ejected + '  (' + (100 * stats.ejected / stats.n).toFixed(1) + '%)');
console.log('  木框掉过耐久  ' + stats.lostHp + '  (' + (100 * stats.lostHp / stats.n).toFixed(1) + '%)');
examples.broken.forEach(e => console.log('  [碎] ' + e));
examples.ejected.forEach(e => console.log('  [弹] ' + e));
examples.lostHp.forEach(e => console.log('  [掉耐久] ' + e));

// 死代码确认
let maxVn = 0;
const b2 = RAP.newBuild(); RAP.applySpec(lv, b2, spec);
const st2 = RAP.createRun(lv, b2);
st2.car.y = st2.startY + 30; st2.spawnGrace = 0;
const arr = [];
RAP.Params.collectContacts = arr;
for (let i = 0; i < 900 && st2.phase === 'run'; i++) RAP.step(st2, 1 / 60);
arr.forEach(v => { if (v > maxVn) maxVn = v; });
console.log('\n30 米自由落体能到的最大法向速度 = ' + maxVn.toFixed(2) +
  ' m/s（maxSpeed 限速 ' + RAP.Params.maxSpeed + '）');
console.log('damageCar 分档：6~8 → 1 点，8~11 → 2 点，≥11 → 散架');
console.log('  ≥11 那一档' + (maxVn >= 11 ? '在坠落时可达 ✓' : '不可达 ✗') +
  '；平地跑起来最大约 2.3，日常不会误伤');

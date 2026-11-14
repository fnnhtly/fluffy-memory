/* 1-6 落地时刻的精细扫描：**一次只扎 1 个气球**才是可玩的控制方式。
 *
 * 上一版扫描是"一次扎 3 个"，结果全部以 pig_lost 收场 —— 原因不是关卡设计，
 * 是物理：扔沙袋后净重 −0.6（上升），连扎 3 个立刻变成 +3.0，
 * 以 7.3 m/s² 往下砸，从 6 米高处落地时 v≈13 m/s，远超猪的 10 m/s 阈值，
 * 车当场翻过去。玩家学到的规则会是"气球不能扎"，而不是"要在对的时候扎"。
 *
 * 扎 1 个 = 净重 +0.6 → 1.45 m/s² 缓降。这才是"高度计"该有的手感：
 * 每扎一个，下降趋势明显一档，但不会失控。
 *
 * 所以这里扫的是：
 *   扔沙袋时刻 td × 第一个气球扎破时刻 tp1 × 第二个气球扎破时刻 tp2
 * 判定标准不只是"能通关"，还要看**通关窗口有多宽** ——
 * 窗口窄到 0.2 秒的关是碰运气，不是技巧。
 */
const T = require('./tune_1_6_plat.js');
const R = T.R;

const o = { gapW: 3, platUp: 2 };

function go(sched, opt) {
  const lv = T.build(o);
  if (opt && opt.noBag) lv.partsBox.sandbag = 0;
  if (opt && opt.noBalloon) lv.partsBox.balloon = 0;
  const b = T.makeCar(lv, { balloons: opt && opt.noBalloon ? 0 : 6, sandbags: opt && opt.noBag ? 0 : 3 });
  return T.run(lv, b, sched, 24);
}

const lv = T.build(o);
const ter = R.makeTerrain(lv);
console.log(`沟 c13..c15，高台从 c${lv._platStart} 起（顶 y=${ter.surfaceY(lv._platStart + 0.5).toFixed(2)}），` +
  `助跑面 y=${ter.surfaceY(11.5).toFixed(2)}，终点 c${lv._goalCol}`);

console.log('\n=== 单扎 1 个：扫 (扔沙袋, 扎1) ===');
let wins1 = [];
let best1 = { maxX: -99 };
for (let td = 2.0; td <= 6.01; td += 0.2) {
  for (let tp = td + 0.2; tp <= td + 6.01; tp += 0.2) {
    const r = go([{ t: td, do: 'drop', n: 3 }, { t: tp, do: 'pop', n: 1 }]);
    if (r.res === 'win') wins1.push({ td: +td.toFixed(2), tp: +tp.toFixed(2) });
    if (r.maxX > best1.maxX) best1 = { maxX: r.maxX, td: +td.toFixed(2), tp: +tp.toFixed(2), res: r.res };
  }
}
console.log(`  通关 ${wins1.length} 组` + (wins1.length ? '' : `；最远 x=${best1.maxX.toFixed(1)} 扔@${best1.td} 扎@${best1.tp} (${best1.res})`));
if (wins1.length) {
  const byTd = {};
  wins1.forEach(w => { byTd[w.td] = (byTd[w.td] || []).concat(w.tp); });
  Object.keys(byTd).map(Number).sort((a, b) => a - b).forEach(td => {
    console.log(`    扔@${td.toFixed(1)} → 扎1 @ ${byTd[td].map(t => t.toFixed(1)).join(',')}`);
  });
}

if (!wins1.length) {
  console.log('\n=== 扎 2 个（分两次，每次 1 个）：扫 (扔, 扎1, 扎2) ===');
  const wins2 = [];
  let best2 = { maxX: -99 };
  for (let td = 3.0; td <= 6.01; td += 0.4) {
    for (let t1 = td + 0.4; t1 <= td + 5.01; t1 += 0.4) {
      for (let t2 = t1 + 0.4; t2 <= t1 + 3.01; t2 += 0.4) {
        const r = go([{ t: td, do: 'drop', n: 3 }, { t: t1, do: 'pop', n: 1 }, { t: t2, do: 'pop', n: 1 }]);
        if (r.res === 'win') wins2.push({ td, t1: +t1.toFixed(2), t2: +t2.toFixed(2) });
        if (r.maxX > best2.maxX) best2 = { maxX: r.maxX, td, t1: +t1.toFixed(2), t2: +t2.toFixed(2), res: r.res };
      }
    }
  }
  console.log(`  通关 ${wins2.length} 组` + (wins2.length ? '' : `；最远 x=${best2.maxX.toFixed(1)} 扔@${best2.td} 扎@${best2.t1}/${best2.t2} (${best2.res})`));
  if (wins2.length) {
    const byTd = {};
    wins2.forEach(w => { (byTd[w.td] = byTd[w.td] || []).push(`${w.t1}/${w.t2}`); });
    Object.keys(byTd).map(Number).sort((a, b) => a - b).slice(0, 12).forEach(td => {
      console.log(`    扔@${td.toFixed(1)} → ${byTd[td].slice(0, 8).join(' ')}`);
    });
  }
}

/* 建造页能不能看见"这关长什么样"？（纯 Node，几何 + 地形统计）
 *
 * 前身的 probe_goal_in_build.js 里有一个坏判据：数全屏"奶白像素"当终点旗。
 * 建造页背景是亮天空，光天空就有一千多个近白像素 —— 读数 1217 vs 1217，
 * **两种条件给出同一个数**，那条量具什么也没量。删掉重写：
 * 几何是确定的（buildCam 的公式就在这儿），地形统计也是确定的，不需要浏览器。
 */
const path = require('path');
const fs = require('fs');
const R = require(path.join(__dirname, '..', 'prototype', 'game.js'));
const LEVELS = require(path.join(__dirname, '..', 'prototype', 'levels.js'));

/* 与 index.html 一致的建造期相机：x = start.col + 3.2, zoom = 2.1, PPM = 32, DW = 1280 */
const PPM = 32, DW = 1280, ZOOM = 2.1, OFF = 3.2;
const halfW = (DW / 2) / (PPM * ZOOM);
const viewL = sx => sx + OFF - halfW, viewR = sx => sx + OFF + halfW;

const rows = [];
LEVELS.forEach(lv => {
  const ter = R.makeTerrain(lv);
  const sCol = lv.start.col, gCol = lv.goal.col;
  const goalX = gCol + 0.5;
  const visLeft = viewL(sCol), visRight = viewR(sCol);
  /* 起点→终点这一段的地形起伏 */
  const N = 220;
  const ys = [];
  for (let i = 0; i <= N; i++) ys.push(ter.surfaceY(sCol + (gCol + 0.5 - sCol) * i / N));
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  /* "最陡的一段"：相邻样本最大落差 */
  let maxStep = 0;
  for (let i = 1; i <= N; i++) maxStep = Math.max(maxStep, Math.abs(ys[i] - ys[i - 1]) * N / (gCol + 0.5 - sCol));
  const boxes = (lv.boxes || []).map(b => b.col + 0.5);
  rows.push({
    id: lv.levelId,
    view: `${visLeft.toFixed(1)}..${visRight.toFixed(1)}`,
    goalX: +goalX.toFixed(2),
    goalVisible: goalX >= visLeft && goalX <= visRight,
    hiddenPart: +Math.max(0, goalX - visRight).toFixed(2),
    hiddenFrac: +(Math.max(0, goalX - visRight) / (goalX - sCol)).toFixed(2),
    relief: +(maxY - minY).toFixed(2),
    steep: +maxStep.toFixed(2),
    boxesInView: boxes.filter(x => x >= visLeft && x <= visRight).length + '/' + boxes.length
  });
});
console.table(rows);

const allHidden = rows.every(r => !r.goalVisible);
console.log(`\n终点在建造页视野内：${rows.filter(r => r.goalVisible).length} / ${rows.length}`);
console.log(`起点→终点这一段里，被挡在屏幕外的比例：` +
  rows.map(r => `${r.id}=${(r.hiddenFrac * 100).toFixed(0)}%`).join('  '));
console.log(`地形起伏（起点→终点最高-最低）：` +
  rows.map(r => `${r.id}=${r.relief}m`).join('  '));
console.log(`最陡落差梯度（米/米）：` + rows.map(r => `${r.id}=${r.steep}`).join('  '));
console.log(`\n结论：${allHidden ? '六关的终点**一个都不在**建造页视野里 —— ' : ''}` +
  '这一段的起伏是 1.2~3.0 米，是全关唯一的难点来源，而玩家在选零件的时候看不到它。');

/* 建成后这一条能省掉的东西：玩家现在只能靠"发射—撞—回建造"来学地形。
 * 数一下六关的标准解里有多少次触地发生在视野外（那些地方玩家是蒙对的）。 */
console.log('\n标准解触地/撞击事件里，有多少发生在建造页视野之外：');
const SPEC_FOR = { '1-1': '1-1', '1-2': '1-2', '1-3': '1-3', '1-4': '1-4i', '1-5': '1-5n', '1-6': '1-6' };
LEVELS.forEach(lv => {
  const st = R.simulate(lv, R.SPECS[SPEC_FOR[lv.levelId]], { maxTime: 60 });
  const vr = viewR(lv.start.col);
  const xs = (st.events || []).filter(e => e.indexOf('touch lvl=') === 0)
    .map(e => { const m = /x=([\d.]+)/.exec(e); return m ? parseFloat(m[1]) : null; })
    .filter(x => x !== null);
  const out = xs.filter(x => x > vr).length;
  console.log(`  ${lv.levelId}  触地 ${xs.length} 次，视野外 ${out} 次` +
    (xs.length ? `（最远 ${Math.max(...xs).toFixed(1)} m，视野右界 ${vr.toFixed(1)} m）` : ''));
});
void fs; void viewL;

/* 地形剖面尺：把 mapRows 变成"车实际会感到的高度曲线"。
 *
 * 为什么需要它：mapRows 里的 '#' 是**离散格子**，而车只跟 `terrain.surfaceY(x)` 接触 ——
 * 那是经过 3 轮 5 抽高斯平滑再线性插值的**连续高度场**。
 * 于是"我画了一个 6 米深的沟"和"车遇到了一个 6 米深的沟"完全可能不是一回事：
 * 平滑会把深沟两侧的高地往下拉、把沟底往上抬，最后变成一个温和的斜坡，
 * 车顺着坡就滑过去了 —— 而你在 mapRows 里盯半天也看不出问题。
 *
 * 这个工具同时打印两件事：
 *   1. 原始 topRow / rawH（你画的东西）
 *   2. surfaceY 逐列采样 + 最大坡度（车真正面对的东西）
 * 坡度 > 0.75（=tan36.9°，用户定的 chassisGrip）就是"爬不上去"的墙。
 */
const path = require('path');

function load(name) {
  return require(path.join(__dirname, '..', 'levels', name));
}

function profile(lv) {
  const R = require('../prototype/game.js');
  const ter = R.makeTerrain(lv);
  const cols = ter.cols;
  const rows = [];
  for (let c = 0; c < cols; c++) {
    const y = ter.surfaceY(c + 0.5);
    const yPrev = c > 0 ? ter.surfaceY(c - 0.5) : y;
    rows.push({
      c, raw: ter.topRow[c], rawH: lv.grid.rows - ter.topRow[c],
      smoothH: +ter.heightField[c].toFixed(2),
      y: +y.toFixed(2),
      slope: +((y - yPrev)).toFixed(2),      // 每列的高度变化（列宽 1 m）
      mat: ter.material[c]
    });
  }
  return { ter, cols, rows };
}

function report(name, lv) {
  const p = profile(lv);
  console.log(`\n===== ${lv.levelId} ${lv.name}（${name}）cols=${p.cols} =====`);
  const cliff = p.rows.filter(r => Math.abs(r.slope) > 0.75);
  let line = '';
  p.rows.forEach(r => {
    const tag = Math.abs(r.slope) > 0.75 ? '‖' : (r.slope > 0.3 ? '/' : (r.slope < -0.3 ? '\\' : '_'));
    line += tag;
  });
  console.log('  形状: ' + line);
  console.log('  硬台阶列 hardCols=' + JSON.stringify(lv.hardCols || []));
  console.log('  爬不上去的列（|Δy| > 0.75）: ' + (cliff.length ? cliff.map(r => `c${r.c}(Δ${r.slope})`).join(' ') : '无'));
  // 逐列打印，只看有变化的
  let prev = null;
  const out = [];
  for (const r of p.rows) {
    const key = `${r.rawH}|${r.smoothH}|${r.mat}`;
    if (key !== prev) { out.push(r); prev = key; }
  }
  console.log('  关键列（只列出 raw/平滑/材质有变化的地方）:');
  out.forEach(r => console.log(`    c${String(r.c).padStart(2)}  rawH=${String(r.rawH).padStart(2)}  平滑后=${String(r.smoothH).padStart(5)}  y=${String(r.y).padStart(5)}  坡=${String(r.slope).padStart(5)}  ${r.mat}`));
  return p;
}

const which = process.argv.slice(2);
if (which.length) {
  which.forEach(w => report(w, load(w)));
} else {
  ['01.json', '02.json', '06.json'].forEach(w => report(w, load(w)));
}
module.exports = { profile, report };

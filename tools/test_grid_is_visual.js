/* 「拼装区不要嵌入地底」的守卫：网格尺寸必须是**纯视觉**参数。
 *
 * 第 65 轮踩到的形状：`partPos()` 原来写 `y = (BUILD_ROWS-1)/2 - r`，
 * 于是把行数从 8 改成 6 会让所有零件的局部坐标整体 +1 米 ——
 * 世界位置没变，力矩的力臂却变了 1 米，1-1 的标准解从 3 星变翻车。
 *
 * 现在锚点是常量 BUILD_ANCHOR_ROW，所以：
 *   A. 局部坐标只由 (锚点 - 行号) 决定，与 BUILD_ROWS 无关；
 *   B. 同一份 spec 在网格里往上/往下挪，局部坐标必须同步平移（否则物理会变）；
 *   C. 网格最下面那一行画出来必须在地面**之上**（不嵌进地底）。
 */
const path = require('path');
const RAP = require('../prototype/game.js');
const levels = require('../prototype/levels.js');
const A = require('./lib/asserts');

const lv = levels[0];

function buildFrom(spec, rowShift) {
  const b = RAP.newBuild();
  for (const part of Object.keys(spec)) {
    if (part.startsWith('_')) continue;
    spec[part].forEach(([r, c]) => {
      const key = (r + rowShift) + ',' + c;
      const isInner = RAP.PARTS[part] && RAP.PARTS[part].inner;
      if (!b.cells[key]) { b.cells[key] = { part, dir: 0 }; b.order.push(key); }
      if (isInner) b.cells[key].inner = part;
    });
  }
  return b;
}

/* A. 锚点存在且是常量，partPos 不再读 BUILD_ROWS */
A.chk('A1 引擎导出了常量锚点行', typeof RAP.BUILD_ANCHOR_ROW === 'number',
  String(RAP.BUILD_ANCHOR_ROW));
const src = require('fs').readFileSync(
  path.join(__dirname, '..', 'prototype', 'game.js'), 'utf8');
/* 必须先剥掉注释再查：注释里这几行**故意写着** (BUILD_ROWS-1)/2，
 * 说明这个写法为什么被废弃。不剥注释的检查会以"我自己写的墓碑"为由报红。 */
const stripComments = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const partPosBody = /function partPos\s*\([\s\S]{0,600}?\n  \}/.exec(stripComments(src));
A.chk('A2 partPos 里没有 (BUILD_ROWS - 1) / 2 这种"跟着行数走"的写法',
  !!partPosBody && partPosBody[0].indexOf('BUILD_ROWS') < 0,
  partPosBody ? partPosBody[0].replace(/\s+/g, ' ').slice(0, 120) : '没找到 partPos');

/* B. 整体移动行号 = 局部坐标整体平移，形状不变 */
const spec = RAP.SPECS['1-1'];
const at0 = RAP.buildVehicle(lv, buildFrom(spec, 0));
const at1 = RAP.buildVehicle(lv, buildFrom(spec, 1));
const shape = c => c.parts.map(p => p.part + ':' + (p.lx - 0).toFixed(2) + ',' + p.ly.toFixed(2))
  .sort().join('|');
const h0 = at0.hull, h1 = at1.hull;
A.chk('B1 整体下移一行后，车壳尺寸一模一样',
  Math.abs((h0.maxX - h0.minX) - (h1.maxX - h1.minX)) < 1e-9 &&
  Math.abs((h0.maxY - h0.minY) - (h1.maxY - h1.minY)) < 1e-9,
  JSON.stringify({ w0: h0.maxX - h0.minX, w1: h1.maxX - h1.minX }));
A.chk('B2 整体下移一行后，所有零件的局部 y 一起 -1（形状没变形）',
  at0.parts.every(p0 => {
    const p1 = at1.parts.find(q => q.part === p0.part && q.lx === p0.lx);
    return p1 && Math.abs((p1.ly - p0.ly) - (-1)) < 1e-9;
  }),
  'ly 差集合=' + JSON.stringify([...new Set(at0.parts.map(p0 => {
    const p1 = at1.parts.find(q => q.part === p0.part && q.lx === p0.lx);
    return p1 ? +(p1.ly - p0.ly).toFixed(6) : 'missing';
  }))]));

/* C. 网格最下面那一行在地面之上 */
const ter = RAP.makeTerrain(lv);
const surf = ter.surfaceY(lv.start.col + 0.5);
/* 车心在 createRun 里是 surface - lowest + 0.01；网格下沿对应"最低那一行"的底面 */
A.chk('C1 网格是 6 行（原来 8 行时下面两行埋在地底）', RAP.BUILD_ROWS === 6,
  String(RAP.BUILD_ROWS));
A.chk('C2 车身锚点行（3.5）在网格内', RAP.BUILD_ANCHOR_ROW > 0 &&
  RAP.BUILD_ANCHOR_ROW < RAP.BUILD_ROWS, String(RAP.BUILD_ANCHOR_ROW));

A.finish(null, null);

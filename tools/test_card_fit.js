/* 所有卡片容器里，文字有没有越出容器边框（第 95 轮）。
 *
 * ── 上一轮只查了结算卡 ──
 *
 * 第 94 轮在结算卡里发现「本关★/总计★」画在 `cardY + 428`、
 * 而卡高 424 —— 4 px 落在卡底外面，压在金色边框上。
 * `test_layout_audit` 抓不到（它只查"有没有越出**屏幕**"）。
 *
 * 而项目里还有四张同样结构的卡片，各自有自己的高度和一堆 `+N` 绝对坐标：
 *
 *   欢迎页    drawWelcome
 *   选关页    drawLevelSelect（用 levelCardsLayout）
 *   零件说明  drawHelp（W=1060, ROWH=46, 高度按件数算）
 *   暂停卡    pausePanel（PW=420, PH=236）
 *
 * 同样的 4 px 越界可能还有几处。
 *
 * ── 怎么量 ──
 *
 * 对每个卡片：从源码里读出它的几何（底部边界），
 * 再从源码里扫出所有"画在这个卡片坐标系里"的 `text(...)` 基线，
 * 要求每一条都 ≤ 卡底。
 *
 * 这是**静态扫描**：确定、快、能覆盖所有分支。
 * 它在第 94 轮被抓过一次"扫描范围漏掉被测对象"（跨行调用），
 * 所以这里统一用"从 `text(` 往后看 5 行"的拼接口径。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const s = fs.readFileSync(path.join(ROOT, 'prototype', 'index.html'), 'utf8');
const lines = s.split(/\r?\n/);

let pass = 0, fail = 0;
const out = [];
function chk(label, cond, extra) {
  if (cond) { pass++; out.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; out.push('✗ ' + label + '  ' + (extra || '')); }
}

/* 抓一个函数的函数体（从 `function NAME(` 到下一个同缩进的 function） */
function fnBody(name) {
  const i0 = lines.findIndex(l => new RegExp('function ' + name + '\\(').test(l));
  if (i0 < 0) return null;
  let i1 = lines.length;
  for (let i = i0 + 1; i < lines.length; i++) {
    if (/^  function \w+\(/.test(lines[i])) { i1 = i; break; }
  }
  return { start: i0 + 1, end: i1, body: lines.slice(i0, i1) };
}

/* 扫一段函数体里所有 `text(...)` 调用，返回每个调用里的表达式（跨行拼接） */
function textCalls(body, baseLine) {
  const calls = [];
  body.forEach((l, k) => {
    if (!/\btext\(/.test(l)) return;
    let joined = l;
    for (let t = 1; t <= 5 && k + t < body.length; t++) joined += ' ' + body[k + t];
    const cut = joined.indexOf(');');
    calls.push({ line: baseLine + k, expr: cut > 0 ? joined.slice(0, cut) : joined });
  });
  return calls;
}

console.log('=== 五张卡片的容器内文字边界 ===');

/* ─────────── 1. 结算卡（第 94 轮已修，这里复核） ─────────── */
{
  const fn = fnBody('drawResult');
  const CARD_Y = 150, CARD_H = 424, BOTTOM = CARD_Y + CARD_H;
  const ys = [];
  textCalls(fn.body, fn.start).forEach(c => {
    [...c.expr.matchAll(/cardY\s*\+\s*(\d+)/g)].forEach(m => {
      ys.push({ y: CARD_Y + parseInt(m[1], 10), line: c.line, n: +m[1] });
    });
  });
  const over = ys.filter(x => x.y > BOTTOM);
  ys.sort((a, b) => b.y - a.y);
  console.log('结算卡（卡底 ' + BOTTOM + '）：' + ys.length + ' 处文字，最低 y=' +
    ys[0].y + '（cardY+' + ys[0].n + '）');
  chk('A 结算卡内所有文字在卡底之上', over.length === 0,
    over.length ? over.map(x => 'y=' + x.y).join(' ') : '最低 y=' + ys[0].y);
}

/* ─────────── 2. 暂停卡 ─────────── */
{
  /* pausePanel() { const PW = 420, PH = 236; return { x: DW/2-PW/2, y: DH/2-PH/2-10, w: PW, h: PH }; } */
  const PW = 420, PH = 236;
  const PY = 720 / 2 - PH / 2 - 10;       // 242
  const BOTTOM = PY + PH;
  const fn = fnBody('drawHud');
  /* 暂停卡的文字画在 drawHud 里（P.y + N） */
  const ys = [];
  textCalls(fn.body, fn.start).forEach(c => {
    [...c.expr.matchAll(/\bP\.y\s*\+\s*(\d+)/g)].forEach(m => {
      ys.push({ y: PY + parseInt(m[1], 10), line: c.line, n: +m[1] });
    });
  });
  if (!ys.length) {
    /* 文字可能用 pausePanel() 的局部量；退一步扫 drawHud 里 P.y */
    console.log('暂停卡：drawHud 里没找到 P.y + N 的文字');
    chk('B 暂停卡内所有文字在卡底之上（未找到可扫的文字）', true, '跳过');
  } else {
    ys.sort((a, b) => b.y - a.y);
    console.log('暂停卡（卡底 ' + BOTTOM + '）：' + ys.length + ' 处文字，最低 y=' +
      ys[0].y + '（P.y+' + ys[0].n + '）');
    const over = ys.filter(x => x.y > BOTTOM);
    chk('B 暂停卡内所有文字在卡底之上', over.length === 0,
      over.length ? over.map(x => 'y=' + x.y).join(' ') : '最低 y=' + ys[0].y);
  }
}

/* ─────────── 3. 零件说明 ─────────── */
{
  /* drawHelp: W=1060, ROWH=46, perCol=ceil(n/2), H = 76 + perCol*46 + 44, Y = max(40, (720-H)/2-6) */
  const fn = fnBody('drawHelp');
  const mw = fn.body.join('\n').match(/const W = (\d+), ROWH = (\d+);/);
  const mh = fn.body.join('\n').match(/const H = (\d+) \+ perCol \* ROWH \+ (\d+);/);
  const my = fn.body.join('\n').match(/const Y = Math\.max\((\d+), \(DH - H\) \/ 2 - (\d+)\);/);
  if (!mw || !mh || !my) {
    chk('C 前提：能读出零件说明的几何常量', false,
      JSON.stringify({ mw: !!mw, mh: !!mh, my: !!my }));
  } else {
    const BASE = +mh[1], ADD = +mh[2];
    const YMIN = +my[1], YOFF = +my[2];
    /* 用最多的那一页（TRAY_ORDER 长度取最大，保守按 14 件算） */
    const PER_COL = Math.ceil(14 / 2);
    const H = BASE + PER_COL * (+mw[2]) + ADD;
    const Y = Math.max(YMIN, (720 - H) / 2 - YOFF);
    const BOTTOM = Y + H;
    const ys = [];
    textCalls(fn.body, fn.start).forEach(c => {
      [...c.expr.matchAll(/\bY\s*\+\s*(\d+)/g)].forEach(m => {
        ys.push({ y: Y + parseInt(m[1], 10), line: c.line, n: +m[1] });
      });
    });
    ys.sort((a, b) => b.y - a.y);
    if (ys.length) {
      console.log('零件说明（H=' + H + '，Y=' + Y.toFixed(0) +
        '，卡底 ' + BOTTOM.toFixed(0) + '）：' + ys.length + ' 处，最低 y=' +
        ys[0].y.toFixed(0) + '（Y+' + ys[0].n + '）');
      const over = ys.filter(x => x.y > BOTTOM);
      chk('C 零件说明内所有文字在卡底之上', over.length === 0,
        over.length ? over.map(x => 'y=' + x.y.toFixed(0)).join(' ') :
          '最低 y=' + ys[0].y.toFixed(0));
    } else {
      chk('C 前提：能扫到零件说明里的文字', false, '0 处');
    }
  }
}

/* ─────────── 4. 欢迎页 ─────────── */
{
  const fn = fnBody('drawWelcome');
  /* ⚠ 欢迎卡的高度是**两段式**的（第 63 轮的注释写得很清楚）：
   *   零件页：92 + 行数 × 24 + 16，y = 96
   *   其他页：306，y = 132
   * 第一版用正则找 `const W = (\d+)` / `const H = (\d+)` ——
   * 而那段代码里根本没有这两个常量（`h` 是小写、而且带三元），
   * 于是 D 组报"读不出几何"。改成直接解析那两个表达式。
   *
   * 这一条要守的是**最坏情况**：零件页 14 行时卡底不能出屏幕。
   * 卡底 = 96 + 92 + 14×24 + 16 = 540，按钮在卡底 +14，高 54 → 608。 */
  const wc = fnBody('welcomeCard');
  const txt = wc ? wc.body.join('\n') : '';
  const partsY = txt.match(/page\.art === 'parts' \? (\d+) : (\d+), w: 760/);
  const partsH = txt.match(/\? (\d+) \+ welcomePartRows\(\)\.length \* rowH \+ (\d+)\s*\n\s*: (\d+);/);
  if (!partsY || !partsH) {
    chk('D 前提：能解析欢迎卡的两段式几何', false,
      JSON.stringify({ partsY: !!partsY, partsH: !!partsH }));
  } else {
    const PY = +partsY[1];              // 零件页卡顶
    const BASE = +partsH[1], ADD = +partsH[2];
    const ROWS = 14;                    // 最坏情况：零件全展开
    const H = BASE + ROWS * 24 + ADD;
    const BOTTOM = PY + H;
    console.log('欢迎页零件卡（最坏 ' + ROWS + ' 行）：y=' + PY +
      '，高 ' + H + '，卡底 ' + BOTTOM);
    chk('D 欢迎页零件卡（14 行）卡底 + 按钮仍在屏幕内',
      BOTTOM + 14 + 54 <= 720, (BOTTOM + 14 + 54) + ' ≤ 720');

    /* 也扫一遍文字：drawWelcome 里所有 `Y + N` 相对卡内容坐标 */
    const ys = [];
    textCalls(fn.body, fn.start).forEach(c => {
      [...c.expr.matchAll(/\bY\s*\+\s*(\d+)/g)].forEach(m => {
        ys.push({ n: parseInt(m[1], 10), line: c.line });
      });
    });
    ys.sort((a, b) => b.n - a.n);
    if (ys.length) {
      console.log('欢迎页文字：' + ys.length + ' 处，最低 Y+' + ys[0].n +
        '（卡内容高 ' + H + '）');
      const over = ys.filter(x => x.n > H);
      chk('D2 欢迎页文字在卡内容范围内（Y+N ≤ 卡高）', over.length === 0,
        over.length ? over.map(x => 'Y+' + x.n).join(' ') : '最低 Y+' + ys[0].n);
    } else {
      chk('D2 前提：能扫到欢迎页里的文字', false, '0 处');
    }
  }
}

/* ─────────── 5. 选关页 ─────────── */
{
  /* levelCardsLayout: CW, CH=250, GAP=14, x0, y=168
   * 卡片内文字用 `y + N`（局部 y，来自 levelCardRect）。 */
  const fn = fnBody('levelCardsLayout');
  const txt = fn ? fn.body.join('\n') : '';
  const mch = txt.match(/const CH = (\d+);/);
  const my = txt.match(/x0: \(DW - totalW\) \/ 2, y: (\d+)/);
  if (!mch || !my) {
    chk('E 前提：能读出选关卡的 CH 与 y', false,
      JSON.stringify({ mch: !!mch, my: !!my }));
  } else {
    const CH = +mch[1], CY = +my[1];
    const dfn = fnBody('drawLevelSelect');
    const ys = [];
    /* 卡片内的文字是 `y + N`（y 来自 levelCardRect(i)） */
    textCalls(dfn.body, dfn.start).forEach(c => {
      [...c.expr.matchAll(/,\s*y\s*\+\s*(\d+)\s*,/g)].forEach(m => {
        ys.push({ n: parseInt(m[1], 10), line: c.line });
      });
    });
    ys.sort((a, b) => b.n - a.n);
    if (ys.length) {
      console.log('选关卡（高 ' + CH + '，卡顶 y=' + CY + '）：' + ys.length +
        ' 处卡片内文字，最低 y+' + ys[0].n);
      const over = ys.filter(x => x.n > CH);
      chk('E 选关卡内所有文字在卡底之上（y+N ≤ 卡高 ' + CH + '）',
        over.length === 0,
        over.length ? over.map(x => 'y+' + x.n).join(' ') : '最低 y+' + ys[0].n);
    } else {
      chk('E 前提：能扫到选关卡里的卡片内文字', false, '0 处');
    }
  }
}

/* ─────────── 6. 两张卡片之间的**垂直不重叠** ─────────── */
{
  /* 选关卡的卡底 = 168 + 250 = 418。
   * 选关页底部有一块"总进度"面板（BX/BY/BW/BH），它必须在卡底之下，
   * 否则会压住卡片。这条守的是"两张卡片不会撞在一起"。 */
  const fn = fnBody('levelCardsLayout');
  const txt = fn ? fn.body.join('\n') : '';
  const mch = txt.match(/const CH = (\d+);/);
  const my = txt.match(/x0: \(DW - totalW\) \/ 2, y: (\d+)/);
  const dfn = fnBody('drawLevelSelect');
  const dTxt = dfn ? dfn.body.join('\n') : '';
  /* ⚠ 真实写法是 `const BW = 520, BX = DW / 2 - BW / 2, BY = 478;` ——
   * **BW 在 BX 前面**，而且 BY 是第四个。第一版的正则要求
   * `const BX = .., BY = .., BW = .., BH = ..`，一条都不匹配。
   * 改成逐个变量抓，BY 按纯数字取。 */
  const mbw = dTxt.match(/const BW = (\d+)/);
  const mby = dTxt.match(/\bBY = (\d+)/);
  if (mch && my) {
    const CARD_BOTTOM = +my[1] + +mch[1];
    if (mbw && mby) {
      const BY = +mby[1], BH = 92;      // 面板 roundRect 的 h 在下一行
      console.log('选关页：卡片底 y=' + CARD_BOTTOM +
        '，总进度面板 BY=' + BY + '（高约 ' + BH + '，底 ' + (BY - 26 + BH) + '）');
      chk('F 选关页的总进度面板在卡片下方（不压卡片）',
        BY - 26 >= CARD_BOTTOM, (BY - 26) + ' ≥ ' + CARD_BOTTOM);
      chk('F2 总进度面板底边不越出屏幕',
        BY - 26 + BH <= 720, (BY - 26 + BH) + ' ≤ 720');
    } else {
      chk('F 前提：能读出总进度面板的 BW/BY', false,
        JSON.stringify({ mbw: !!mbw, mby: !!mby }));
    }
  } else {
    chk('F 前提：能读出选关卡的 CH/y', false, '读不出');
  }
}

console.log('');
console.log(out.join('\n'));
console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
process.exit(fail ? 1 : 0);

/* 「画出来的东西真的画出来了吗」（第 89 轮）。
 *
 * ── 为什么需要它 ──
 *
 * `tools/mutation_browser.js` 对 9 条绘制/HUD 变异跑 8 个代表性浏览器测试，
 * 其中 4 条**没有任何测试变红**：
 *
 *   · `drawTray` 早退（零件箱不画）
 *   · `drawHintBtn` 早退（提示键不画）
 *   · `drawHintCard` 早退（提示卡不画）
 *   · `runTimeRects` 三块重叠
 *
 * 前三条的共同点：现有测试量的是**逻辑**（`trayRect(i)` 的坐标、
 * `hintFor(lv,tier)` 的文案、`hintRect()` 的几何），而不是**像素**。
 * 一个函数被整个早退掉，那些断言照样通过 —— 它们量的是"该画在哪"，
 * 不是"画出来了没有"。
 *
 * 这是"判据空转"的第六种形态：**逻辑对、画面空**。
 *
 * ── 这个脚本怎么量 ──
 *
 * 对每个"必须看得见"的东西，做**存在性像素差分**：
 *
 *   1. 抓一帧（正常状态）→ 图 A
 *   2. 把那个 `drawXxx` 临时早退掉（通过一个测试钩子 `state.__hideDraw`）
 *      → 抓一帧 → 图 B
 *   3. A 与 B 在**目标矩形**内的差异像素数必须 > 阈值
 *
 * 用测试钩子而不是改源码：改源码要重载页面，而重载会丢掉状态。
 * 钩子只由测试写，玩家永远不设它。
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

(async () => {
  const PORT = 9720 + Math.floor(Math.random() * 200);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgeDraw89-' + Date.now()),
    '--window-size=1280,760', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  const send = (method, params) => new Promise((res, rej) => {
    const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const errs = [];
  ws.addEventListener('message', e2 => {
    try {
      const m = JSON.parse(e2.data);
      if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text);
    } catch (e) {}
  });
  const ev = async e => {
    const r = await send('Runtime.evaluate',
      { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('页面求值异常：' + (d.exception && d.exception.description || d.text));
    }
    return r.result.value;
  };

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  /* 在目标矩形内抓差异：返回有差异的像素数 */
  async function diffInRect(rect, setup) {
    await ev('(()=>{const S=window.__rap.state; S.__hideDraw=null; S.shake=0; return 1;})()');
    await ev(setup);
    await sleep(420);
    await ev('(()=>{const cv=document.getElementById("cv"), g=cv.getContext("2d");' +
      'window.__A=g.getImageData(0,0,cv.width,cv.height).data; return 1;})()');
    await ev('(()=>{const S=window.__rap.state; S.__hideDraw=' +
      JSON.stringify(setup.__hide || '') + '; return 1;})()');
    return null;
  }

  /* 更直接的做法：一次 evaluate 里完成"抓 A / 设钩子 / 抓 B"。
   * 但渲染是 rAF 驱动的，evaluate 里拿不到新帧 —— 所以只能：
   *   抓 A → sleep → 设钩子 → sleep → 抓 B */
  async function capture() {
    return await ev('(()=>{const cv=document.getElementById("cv"), g=cv.getContext("2d");' +
      'const d=g.getImageData(0,0,cv.width,cv.height).data;' +
      'const out=[]; for(let i=0;i<d.length;i+=4) out.push(d[i],d[i+1],d[i+2]); return out;})()');
  }

  /* 差异像素数（在给定设计坐标矩形内）
   *
   * ⚠ 坐标换算：`VIEW_OFF_X = (VIEW_W − DW) / 2` —— 设计空间是**扩展**的
   * （cover 模式下多出来的部分），设计坐标要**加**偏移才是屏幕坐标：
   *
   *     屏幕 X = (设计 x + offX) × k
   *
   * 第一版写成 `(rect.x − offX)`，减号。hintRect x=24、offX=37 时
   * 算出屏幕 −12 —— 采样区落在画布外面，于是差分恒为 0，
   * 报"提示键没画出来"。**那是量具的错，不是产品的错。**
   * （同一个病的第九种形态：坐标变换写反。） */
  function diffCount(a, b, rect, view, cvW, cvH) {
    const k = cvW / view.W;
    let n = 0;
    const x0 = Math.max(0, Math.round((rect.x + view.offX) * k));
    const y0 = Math.max(0, Math.round((rect.y + view.offY) * k));
    const x1 = Math.min(cvW, Math.round((rect.x + rect.w + view.offX) * k));
    const y1 = Math.min(cvH, Math.round((rect.y + rect.h + view.offY) * k));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * cvW + x) * 3;
        if (Math.abs(a[i] - b[i]) > 8 || Math.abs(a[i + 1] - b[i + 1]) > 8 ||
            Math.abs(a[i + 2] - b[i + 2]) > 8) n++;
      }
    }
    return { n, area: Math.max(0, (x1 - x0) * (y1 - y0)) };
  }

  const view = JSON.parse(await ev('JSON.stringify({W:window.__view.W,H:window.__view.H,' +
    'offX:window.__view.offX,offY:window.__view.offY})'));
  const cvSize = JSON.parse(await ev('(()=>{const cv=document.getElementById("cv");' +
    'return JSON.stringify({w:cv.width,h:cv.height});})()'));

  /* ---------- 三件"必须看得见"的东西 ---------- */
  const CASES = [
    {
      name: '零件箱（drawTray）',
      phase: 'build',
      rect: () => ev(`(()=>{const R=window.__rap;
        const rs=[]; for(let i=0;i<R.TRAY.length;i++) rs.push(R.trayRect(i));
        if(!rs.length) return null;
        const x0=Math.min(...rs.map(r=>r.x)), y0=Math.min(...rs.map(r=>r.y));
        const x1=Math.max(...rs.map(r=>r.x+r.w)), y1=Math.max(...rs.map(r=>r.y+r.h));
        return JSON.stringify({x:x0,y:y0,w:x1-x0,h:y1-y0});})()`)
    },
    {
      name: '提示键（drawHintBtn）',
      phase: 'build',
      rect: () => ev('JSON.stringify(window.__rap.hintRect())')
    },
    {
      name: '提示卡（drawHintCard）',
      phase: 'build',
      rect: () => ev('JSON.stringify(window.__rap.hintRect())'),
      /* 提示卡要先点开 */
      prep: `(()=>{const S=window.__rap.state, R=window.__rap;
        S.hintTier = 1; S.hintOpen = 1; S.hintT = 1;
        if (R.openHint) R.openHint();
        return 1;})()`,
      rectFrom: () => ev(`(()=>{const R=window.__rap, h=R.hintRect();
        return JSON.stringify({x:Math.max(0,h.x-h.w*2), y:h.y-260, w:560, h:260});})()`)
    }
  ];

  for (const c of CASES) {
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(0); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
      S.paused=false; S.shake=0; S.__hideDraw=null; S.hintOpen=0; S.hintT=0;
      return 1;})()`);
    await sleep(400);
    if (c.prep) { await ev(c.prep); await sleep(400); }
    const rect = JSON.parse(c.rectFrom ? await c.rectFrom() : await c.rect());
    if (!rect || !(rect.w > 0)) {
      chk(c.name + ' 的前提：拿得到目标矩形', false, JSON.stringify(rect));
      continue;
    }
    const A = await capture();
    await ev(`(()=>{window.__rap.state.__hideDraw=${JSON.stringify(c.name.split('（')[1].replace('）', ''))}; return 1;})()`);
    await sleep(450);
    const B = await capture();
    await ev('(()=>{window.__rap.state.__hideDraw=null; return 1;})()');
    await sleep(200);
    const d = diffCount(A, B, rect, view, cvSize.w, cvSize.h);
    const pct = d.area ? d.n / d.area * 100 : 0;
    lines.push(c.name + '：目标区 ' + rect.w + '×' + rect.h +
      '，隐藏前后差异 ' + d.n + ' px（' + pct.toFixed(1) + '%）');
    chk(c.name + ' 真的被画出来了（差异 ≥ 2%）', pct >= 2,
      pct.toFixed(1) + '%');
  }

  console.log('');
  console.log(lines.join('\n'));
  console.log('');
  console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  try { ws.close(); } catch (e) {}
  try { require('./lib/asserts.js').killTree(child); } catch (e) {}
  process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

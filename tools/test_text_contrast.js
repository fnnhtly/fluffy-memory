/* 可读性审计（对比度）：把"白字压在亮天空上看不见"变成可测量的问题。
 *
 * 原理：
 *   1. 给 fillText 加一个总开关 __skipText。
 *   2. 同一画面拍两遍 —— 一遍不画字（得到纯背景），一遍正常（得到背景+字）。
 *   3. 两者差值大的像素就是字形像素；用它算 WCAG 对比度。
 *   4. 报告低于阈值的文字（小字 4.5，20px 以上大字 3.0）。
 *
 * 为什么必须这样做：我没有办法"看"截图，只能让画面自己交出数字。
 */
const fs = require('fs');
const A = require('./lib/asserts');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);   // 随机端口：避免残留进程撞车
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PATCH = `(() => {
  if (window.__leg) return 'already';
  const C = CanvasRenderingContext2D.prototype;
  const oText = C.fillText, oClear = C.clearRect;
  window.__leg = { recs: [], skipText: false };
  C.clearRect = function () { window.__leg.recs = []; return oClear.apply(this, arguments); };
  C.fillText = function (txt, x, y) {
    const m = this.measureText(String(txt));
    const sz = parseFloat((this.font.match(/(\\d+(?:\\.\\d+)?)px/) || [0, 13])[1]) || 13;
    const al = this.textAlign || 'start';
    let x0 = x;
    if (al === 'center') x0 = x - m.width / 2;
    else if (al === 'right' || al === 'end') x0 = x - m.width;
    window.__leg.recs.push({ t: String(txt), x: x0, y: y - sz * 0.78, w: m.width, h: sz, size: sz });
    if (window.__leg.skipText) return;      // 只记录不画
    return oText.apply(this, arguments);
  };
  return 'patched';
})()`;

// 在当前帧上：抓文字盒 → 关字拍一遍 → 开字拍一遍 → 逐盒算对比度
const MEASURE = `(() => {
  const cv = document.getElementById('cv'), g = cv.getContext('2d');
  const sx = cv.width / 1280, sy = cv.height / 720;
  const recs = window.__leg.recs.filter(r => r.t.trim() && r.w > 1.5);
  return new Promise(res => {
    requestAnimationFrame(() => {
      // 这一帧不带字
      window.__leg.skipText = true;
      requestAnimationFrame(() => {
        const boxes = recs.map(r => {
          const x = Math.max(0, Math.floor(r.x * sx)), y = Math.max(0, Math.floor(r.y * sy));
          const w = Math.min(cv.width - x, Math.ceil(r.w * sx)), h = Math.min(cv.height - y, Math.ceil(r.h * sy));
          if (w <= 0 || h <= 0) return null;
          return { r, x, y, w, h, bg: g.getImageData(x, y, w, h).data };
        });
        window.__leg.skipText = false;
        requestAnimationFrame(() => {
          const out = [];
          boxes.forEach(b => {
            if (!b) return;
            const fg = g.getImageData(b.x, b.y, b.w, b.h).data;
            const diffs = [];
            for (let i = 0; i < b.bg.length; i += 4) {
              const d = Math.abs(fg[i]-b.bg[i]) + Math.abs(fg[i+1]-b.bg[i+1]) + Math.abs(fg[i+2]-b.bg[i+2]);
              diffs.push({ i, d });
            }
            diffs.sort((a, c) => c.d - a.d);
            // 只取"字形核心"像素：小字有抗锯齿，边缘像素会严重拉低测得的颜色，
            // 用平均会让 12px 文字一律不合格（第一版就是这样报出 54 条噪声）。
            // 取差异最大的前 8%（至少 6 个像素）再求中位数。
            const keepN = Math.max(6, Math.floor(diffs.length * 0.08));
            const keep = diffs.slice(0, keepN);
            if (!keep.length) { out.push({ t: b.r.t, size: b.r.size, ratio: 0, why: 'no-glyph' }); return; }
            const lum = (r2, g2, b2) => {
              const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
              return 0.2126 * f(r2) + 0.7152 * f(g2) + 0.0722 * f(b2);
            };
            let fr = 0, fgc = 0, fb = 0, br = 0, bgc = 0, bb = 0;
            keep.forEach(o => { fr += fg[o.i]; fgc += fg[o.i+1]; fb += fg[o.i+2];
                               br += b.bg[o.i]; bgc += b.bg[o.i+1]; bb += b.bg[o.i+2]; });
            const n = keep.length;
            // 亮字压在暗底上：fg 取亮端 / bg 取暗端；反过来的情况自动由 max/min 处理
            const L1 = lum(fr/n, fgc/n, fb/n), L2 = lum(br/n, bgc/n, bb/n);
            const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
            out.push({ t: b.r.t, size: b.r.size, ratio: (hi + 0.05) / (lo + 0.05),
                       fgRGB: [Math.round(fr/n), Math.round(fgc/n), Math.round(fb/n)],
                       bgRGB: [Math.round(br/n), Math.round(bgc/n), Math.round(bb/n)] });
          });
          res(JSON.stringify(out));
        });
      });
    });
  });
})()`;

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeL-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = list.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async (e, aw) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!aw });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value;
  };
  await ev(PATCH);
  await ev('window.__rap.state.introT=1');
  await sleep(300);

  const SMALL = 4.5, LARGE = 3.0;      // WCAG AA
  const all = [];
  let bad = 0, total = 0;

  async function check(name, marker) {
    const raw = JSON.parse(await ev(MEASURE, true));
    let rs = raw;
    if (marker) {
      const i = rs.findIndex(r => r.t.indexOf(marker) >= 0);
      if (i < 0) { all.push('✗ ' + name + '  找不到「' + marker + '」'); bad++; return; }
      rs = rs.slice(i);
    }
    const fails = rs.filter(r => r.ratio < (r.size >= 20 ? LARGE : SMALL));
    total += rs.length; bad += fails.length;
    const worst = rs.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 3);
    const lines = [(fails.length ? '✗ ' : '✓ ') + name + '  文字 ' + rs.length +
      '  最低对比 ' + (worst[0] ? worst[0].ratio.toFixed(2) : '—')];
    fails.slice(0, 10).forEach(f => lines.push(
      '    「' + f.t + '」 ' + f.size.toFixed(0) + 'px  对比 ' + f.ratio.toFixed(2) +
      (f.bgRGB ? '  fg rgb(' + f.fgRGB.join(',') + ') / bg rgb(' + f.bgRGB.join(',') + ')' : '  ' + (f.why || ''))));
    if (fails.length > 10) lines.push('    ...还有 ' + (fails.length - 10) + ' 条');
    all.push(lines.join('\n'));
  }

  // ---- build ----
  const o = JSON.parse(await ev('JSON.stringify(window.__rap.buildOrigin())'));
  const BP = await ev('window.__rap.BUILD_PX');
  const TRAY = JSON.parse(await ev('JSON.stringify(window.__rap.TRAY)'));
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function click(dx, dy) {
    const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(150);
  }
  const centerOf = async expr => JSON.parse(await ev(`(()=>{const r=${expr};return JSON.stringify({x:r.x+r.w/2,y:r.y+r.h/2});})()`));
  const trayC = async n => {
    const r = JSON.parse(await ev(`JSON.stringify(window.__rap.trayRect(${TRAY.indexOf(n)}))`));
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };
  const place = async (part, r, c) => {
    const t = await trayC(part); await click(t.x, t.y);
    await click(o.x + c * BP + BP / 2, o.y + r * BP + BP / 2);
  };

  await check('build');
  for (const c of [1, 2, 3]) await place('wood_frame', 4, c);
  for (const c of [1, 3]) await place('wood_wheel', 5, c);
  await place('pig', 4, 2);
  await check('build-full');

  {
    const hb = await centerOf("window.__rap.btnRect('help')"); await click(hb.x, hb.y);
  }
  await check('help', '零件说明 —— 搭之前先知道');
  await click(640, 660); await sleep(200);

  {
    const lb = await centerOf("window.__rap.btnRect('launch')"); await click(lb.x, lb.y);
  }
  await sleep(300);
  await check('run-banner', '1-1');
  await sleep(2300);
  await ev('window.__rap.state.paused=true'); await sleep(250);
  await check('paused', '已暂停');
  await ev('window.__rap.state.paused=false');

  await ev('(()=>{const s=window.__rap.state; s.run.result="win"; s.run.stars=2; s.run.time=12.34; s.phase="resolved"; s.resultT=1; return 1;})()');
  await sleep(600);
  await check('result', '到达终点');
  await ev('(()=>{const s=window.__rap.state; s.phase="build"; s.run=null; s.resultT=0; return 1;})()');
  await sleep(250);

  await ev('window.__rap.state.levelSelect=true'); await sleep(350);
  await check('levelselect', '选择关卡');
  await ev('window.__rap.state.levelSelect=false'); await sleep(250);

  for (let p = 1; p <= 3; p++) {
    await ev(`window.__rap.state.welcome=${p}`); await sleep(350);
    await check('welcome' + p, ['欢迎来到', '零件一览', '跑起来之后'][p - 1]);
  }
  await ev('window.__rap.state.welcome=0'); await sleep(200);

  console.log(all.join('\n'));
  console.log('\n低对比文字: ' + bad + ' / ' + total);
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  ws.close(); A.killTree(child);
  process.exit(bad > 0 || errs.length ? 1 : 0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

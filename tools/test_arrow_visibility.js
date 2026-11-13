/* 推进方向箭头：只在"建造 + 选中该零件 / 悬停该格"时露出，其余时候只有一个小白点，
 * 行驶阶段完全不显示（用户明确要求："我只想要类似打气筒的零件只在建造且选中的时候露出箭头"）。
 *
 * 判据分两层，避免自证：
 *   1. 结构层：state.arrowDrawN —— 这一帧实际调用了几次 drawDirArrow；
 *   2. 视觉层：把打气筒格子外的"环带"像素抓下来，A/B 两次快照逐像素求差。
 *      相机在建造期是静止的，所以环带里任何变化都只能是箭头本身。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);   // 随机端口：避免残留进程撞车
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeAv-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(800);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function move(dx, dy) { const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await sleep(230); }

  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[1];
    window.__rap.startLevel(1); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-2']);
    R.tryPlace(lv, s.build, 'pump', 3, 3);
    s.selected='wood_frame'; s.mouse.x=-999; s.mouse.y=-999;
  })()`);
  await sleep(450);
  const pumpKeys = JSON.parse(await ev(`(()=>{const c=window.__rap.state.build.cells;
    return JSON.stringify(Object.keys(c).filter(k=>c[k]&&c[k].part==='pump'));})()`));
  A.chk('车上有两个打气筒（预设 1 个 + 手动放的 1 个）', pumpKeys.length === 2, pumpKeys.join(' '));

  const BP = await ev('window.__rap.BUILD_PX');
  const OR = JSON.parse(await ev('JSON.stringify(window.__rap.buildOrigin())'));
  const cellCx = OR.x + 3 * BP + BP / 2, cellCy = OR.y + 3 * BP + BP / 2;

  // 环带 = 格心 R*0.55 到 R*1.10 之间（箭头伸出去的那一圈）
  const grabRing = async () => JSON.parse(await ev(`(() => {
    const cv = document.getElementById('cv'), g = cv.getContext('2d');
    const sx = cv.width / 1280, sy = cv.height / 720;
    const R = ${BP}, cx = ${cellCx}, cy = ${cellCy};
    const x0 = Math.round((cx - R * 1.15) * sx), y0 = Math.round((cy - R * 1.15) * sy);
    const w = Math.round(2 * R * 1.15 * sx), h = Math.round(2 * R * 1.15 * sy);
    const d = g.getImageData(x0, y0, w, h).data;
    const out = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx2 = (x / sx) - R * 1.15, dy2 = (y / sy) - R * 1.15;
      const r2 = Math.hypot(dx2, dy2);
      if (r2 < R * 0.55 || r2 > R * 1.10) continue;
      const i = (y * w + x) * 4;
      out.push(d[i], d[i+1], d[i+2]);
    }
    return JSON.stringify(out);
  })()`));
  const diff = (a, b) => {
    let n = 0, sum = 0;
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i] - b[i]);
      if (d > 18) n++;
      sum += d;
    }
    return { changed: n, total: a.length / 3, mean: sum / a.length };
  };

  await move(10, 700);
  const ringIdle = await grabRing();
  const nIdle = await ev('window.__rap.state.arrowDrawN');
  await shot('av-01-not-selected');
  A.chk('没选中打气筒时不画箭头', nIdle === 0, 'arrowDrawN=' + nIdle);

  // 选中打气筒
  await ev("window.__rap.state.selected='pump'; window.__rap.state.mouse.x=-999; window.__rap.state.mouse.y=-999;");
  await sleep(450);
  const nSel = await ev('window.__rap.state.arrowDrawN');
  const ringSel = await grabRing();
  const dSel = diff(ringIdle, ringSel);
  await shot('av-02-selected-pump');
  A.chk('选中打气筒后两个打气筒都亮箭头', nSel === 2, 'arrowDrawN=' + nSel);
  A.chk('箭头的像素真的出现在格子外（A/B 对比）',
    dSel.changed > dSel.total * 0.02,
    '环带里变了 ' + dSel.changed + ' / ' + dSel.total + ' 个采样通道，平均差 ' + dSel.mean.toFixed(1));

  // 取消选中
  await ev("window.__rap.state.selected='wood_frame';");
  await move(10, 700);
  await sleep(400);
  const nBack = await ev('window.__rap.state.arrowDrawN');
  const ringBack = await grabRing();
  const dBack = diff(ringIdle, ringBack);
  A.chk('取消选中后箭头收回', nBack === 0, 'arrowDrawN=' + nBack);
  A.chk('画面回到"没选中"的样子（差异接近噪声）', dBack.changed < dSel.changed * 0.25,
    '撤回后差异 ' + dBack.changed + ' vs 选中时 ' + dSel.changed);

  // 悬停该格：即使选的是木框也亮
  await move(cellCx, cellCy);
  await sleep(450);
  const nHover = await ev('window.__rap.state.arrowDrawN');
  const ringHover = await grabRing();
  const dHover = diff(ringIdle, ringHover);
  await shot('av-03-hover');
  A.chk('鼠标悬停该格也亮箭头（不选中也能改方向）', nHover === 1, 'arrowDrawN=' + nHover);
  A.chk('悬停时环带里也出现箭头像素', dHover.changed > dHover.total * 0.02,
    '变了 ' + dHover.changed + ' / ' + dHover.total);

  // 行驶阶段
  await ev("window.__rap.state.selected='pump';");
  await sleep(200);
  await ev('(()=>{window.__rap.launch(); return window.__rap.state.phase;})()');
  await sleep(700);
  A.chk('已进入行驶阶段', (await ev('window.__rap.state.phase')) === 'run');
  const nRun = await ev('window.__rap.state.arrowDrawN');
  A.chk('行驶阶段完全不画箭头', nRun === 0, 'arrowDrawN=' + nRun);
  await shot('av-04-running');

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

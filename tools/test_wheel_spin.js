/* 轮子转动：轮子确实随里程转（不是画死的），且整圈内不出现频闪
 * （5 辐条对称在高速下曾出现"转到某角度就跳回原样"的观感）。
 *
 * 判据：
 *   A. 只改 odo，轮子那一小块像素必须大幅变化 —— 证明旋转真的驱动了绘制；
 *   B. 沿一整圈取 12 个角度，两两不同 —— 证明没有周期性频闪；
 *   C. 转满 360° 的变化远小于半圈 —— 证明角度公式自洽。
 *
 * 两个坑都踩过了：
 *   1. 不能拿整屏做比较 —— 小猪每 3.6 秒眨眼、出发钮呼吸、速度线，
 *      全都在用 performance.now() 驱动，暂停也照跑，整帧哈希永远不可能相等；
 *   2. 所以只框住轮子自己那块矩形，先量"什么都不改时的噪声"，再拿真实变化去比。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeK-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }

  // 1-3 有马达，跑到高速
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[2];
    window.__rap.startLevel(2); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-3']);
    window.__rap.launch();
  })()`);
  await sleep(2400);

  // 定格：停物理、清粒子/震屏、车速归零
  await ev(`(()=>{const s=window.__rap.state; s.paused=true; s.shake=0; s.slowmo=0;
    s.dust=[]; s.debris=[]; s.confetti=[]; s.flash=0; s.vignette=0;
    const c=s.run.car; c.vx=0; c.vy=0; return 1;})()`);
  await sleep(1500);   // 等镜头弹簧收敛

  // 用页面自己的世界→屏幕变换算出每个轮子的屏幕矩形（不写死坐标）
  const rects = JSON.parse(await ev(`(()=>{
    const s = window.__rap.state, car = s.run.car, cs = s.camState;
    const PPM = 32, DW = 1280, DH = 720;
    const w2s = (wx, wy) => ({ x: DW/2 + (wx - cs.x) * PPM * cs.zoom,
                               y: DH/2 - (wy - cs.y) * PPM * cs.zoom });
    const out = [];
    car.parts.forEach(p => {
      if (!p.def.wheel) return;
      const ca = Math.cos(car.a), sa = Math.sin(car.a);
      const wx = car.x + p.lx * ca - p.ly * sa;
      const wy = car.y + p.lx * sa + p.ly * ca;
      const q = w2s(wx, wy);
      const half = (p.def.radius || 0.5) * PPM * cs.zoom * 1.5;
      out.push({ x: q.x - half, y: q.y - half, w: half * 2, h: half * 2 });
    });
    return JSON.stringify(out);
  })()`));
  A.chk('能定位到轮子的屏幕区域', rects.length > 0, rects.length + ' 个');
  A.log('轮子屏幕矩形 ' + rects.map(r => '[' + r.x.toFixed(0) + ',' + r.y.toFixed(0) +
    ' ' + r.w.toFixed(0) + 'x' + r.h.toFixed(0) + ']').join(' '));

  // 页面内的采样/差分工具：只框轮子矩形
  await ev(`(() => {
    const c = document.getElementById('cv'), g = c.getContext('2d');
    const sx = c.width / 1280, sy = c.height / 720;
    const R = ${JSON.stringify(rects)};
    // 只取"所有轮子矩形的并集"里最靠左那个 —— 单个轮子的旋转证据更干净
    const r0 = R[0];
    window.__grabWheel = () => {
      const x = Math.max(0, Math.round(r0.x * sx)), y = Math.max(0, Math.round(r0.y * sy));
      const w = Math.min(c.width - x, Math.round(r0.w * sx));
      const h = Math.min(c.height - y, Math.round(r0.h * sy));
      return g.getImageData(x, y, w, h).data.slice();
    };
    window.__diffW = (a, b) => { let n = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2]);
        if (d > 24) n++;
      }
      return n; };
    return 1;
  })()`);

  const wheels = JSON.parse(await ev(`(()=>{const c=window.__rap.state.run.car;
    return JSON.stringify(c.parts.filter(p=>p.def.wheel).map(p=>({r:p.def.radius||0.5})));})()`));
  const R = wheels[0].r;
  const setOdo = async v => { await ev(`(()=>{window.__rap.state.run.car.odo = ${v}; return 1;})()`); await sleep(170); };

  // ---- 噪声基线：什么都不改，只等时间过去 ----
  await setOdo(0);
  await ev('window.__snapA = window.__grabWheel(); 1');
  const noises = [];
  for (let i = 0; i < 5; i++) {
    await sleep(260);
    noises.push(await ev('window.__diffW(window.__snapA, window.__grabWheel())'));
  }
  const noise = Math.min(...noises);
  const area = await ev('window.__snapA.length / 4');
  A.log('轮子区域 ' + area + ' 像素；不动时的噪声：' + noises.join(' / ') + '（取最小 ' + noise + '）');

  // ---- A. 只改 odo 到 180° ----
  await ev('window.__snapA = window.__grabWheel(); 1');
  await setOdo(R * Math.PI);
  const dHalf = await ev('window.__diffW(window.__snapA, window.__grabWheel())');
  await shot('ws-half');
  A.chk('转半圈后轮子区域明显变化（不是画死的）',
    dHalf > Math.max(noise * 3 + 20, area * 0.05),
    '变化 ' + dHalf + '/' + area + ' 像素，噪声 ' + noise);

  // ---- B. 整圈 12 个角度两两不同 ----
  // 哈希只在页面里当作"快速指纹"用，所以用两路独立滚动乘法 + 长度，
  // 避免第一版那种"每 13 字节取样求和"在同一张图上撞成 1/12。
  const marks = [];
  for (let k = 0; k < 12; k++) {
    await setOdo(R * (Math.PI * 2) * k / 12);
    marks.push(await ev(`(()=>{const d = window.__grabWheel();
      let h1 = 0x811c9dc5, h2 = 0x01000193;
      for (let i = 0; i < d.length; i++) {
        h1 = ((h1 ^ d[i]) * 16777619) >>> 0;
        h2 = ((h2 + d[i] * (i + 1)) * 2654435761) >>> 0;
      }
      window.__m${k} = d;
      return (h1.toString(16) + ':' + h2.toString(16));})()`));
    if (k === 2) await shot('ws-30');
    if (k === 5) await shot('ws-150');
  }
  const uniq = new Set(marks).size;
  A.chk('一整圈 12 个角度两两不同（不会频闪）', uniq === 12,
    uniq + '/12 唯一：' + marks.join(' '));

  const pairDiffs = [];
  for (let k = 0; k < 11; k++) {
    pairDiffs.push(await ev(`window.__diffW(window.__m${k}, window.__m${k + 1})`));
  }
  const minPair = Math.min(...pairDiffs);
  A.chk('相邻两个角度的轮子都不一样（每步都看得出来）', minPair > noise,
    '最小相邻差异 ' + minPair + ' vs 噪声 ' + noise);

  // ---- C. 360° 应与 0° 几乎一致 ----
  await setOdo(R * Math.PI * 2);
  const dFull = await ev('window.__diffW(window.__m0, window.__grabWheel())');
  A.chk('转满 360° 的变化远小于半圈（角度公式自洽）', dFull < Math.max(dHalf * 0.4, noise * 2),
    '360° 变化 ' + dFull + ' vs 180° 变化 ' + dHalf + '，噪声 ' + noise);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

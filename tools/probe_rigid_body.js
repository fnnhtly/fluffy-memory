/* 「车上的零件都连起来，两个木框粘连起来，不会在下坡时各自转动」——
 * 先把"到底是不是各自转动"量出来，再决定改哪。
 *
 * 两种可能的病因，量法完全不同：
 *   A. 物理/渲染真的让每件零件各自转向 → 组件之间的相对角度会变
 *   B. 位置和角度都是刚体，但**每块木框都画成完整的四个边框**，
 *      贴在一起时中间出现两条并排的粗边 —— 眼睛读成"两个独立的箱子"
 *
 * 这个探针量的是 B：把车钉在一个角度上，逐个水平列找"木色像素"的**最上沿**。
 *   刚体（任意角度）→ 这些点落在一条直线上
 *   各自转动        → 上沿会出现折线 / 分段跳变
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const PORT = 9780 + Math.floor(Math.random() * 100);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeRig-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await ev(`(()=>{const R=window.__rap, S=R.state;
    R.startLevel(0); S.welcome=0; S.introT=1;
    R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-1']);
    R.launch(); return 1;})()`);
  await sleep(900);

  /* 冻结物理，把角度钉住；同时把镜头钉死，避免缓动让采样漂移 */
  async function pin(deg) {
    await ev(`(()=>{const S=window.__rap.state, car=S.run.car;
      S.run.phase = 'frozen';
      car.a = ${deg} * Math.PI / 180; car.w = 0; car.vx = 0; car.vy = 0;
      return 1;})()`);
    await sleep(500);
    // 让 camState 追上后再把 camLive 也钉死
    await ev(`(()=>{const S=window.__rap.state, car=S.run.car;
      S.camState.x = car.x; S.camState.y = car.y; S.camState.zoom = 2.0;
      return 1;})()`);
    await sleep(500);
  }

  async function topEdge() {
    return JSON.parse(await ev(`(()=>{
      const S=window.__rap.state, car=S.run.car;
      const cv=document.getElementById('cv'), g=cv.getContext('2d'), v=window.__view;
      const k = cv.width / v.W;
      const cam = S.camLive;
      const s = 32 * cam.zoom;
      const c = { x: 640 + (car.x - cam.x) * s, y: 360 - (car.y - cam.y) * s };
      const half = Math.round(2.4 * s);            // 车身周围 ±2.4 格（设计像素）
      const x0 = Math.max(0, Math.round((c.x - half) * k));
      const y0 = Math.max(0, Math.round((c.y - half) * k));
      const x1 = Math.min(cv.width, Math.round((c.x + half) * k));
      const y1 = Math.min(cv.height, Math.round((c.y + half) * k));
      const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
      const d = g.getImageData(x0, y0, w, h).data;
      const isWood = (r,gg,b) =>
        (Math.abs(r-201)<30 && Math.abs(gg-147)<30 && Math.abs(b-84)<34) ||
        (Math.abs(r-181)<30 && Math.abs(gg-127)<30 && Math.abs(b-66)<34);
      const pts = [];
      let total = 0;
      for (let xx = 0; xx < w; xx += 2) {
        let first = -1;
        for (let yy = 0; yy < h; yy++) {
          const i = (yy * w + xx) * 4;
          if (isWood(d[i], d[i+1], d[i+2])) { first = yy; break; }
        }
        if (first >= 0) { pts.push([xx, first]); total++; }
      }
      /* 用最小二乘拟合一条直线，再看最大残差：刚体的上沿应当是一个平面投影 */
      let sx=0, sy=0, sxx=0, sxy=0, n=pts.length;
      pts.forEach(([x,y]) => { sx+=x; sy+=y; sxx+=x*x; sxy+=x*y; });
      let slope = 0, icpt = 0;
      if (n > 2) {
        const den = n*sxx - sx*sx;
        slope = den ? (n*sxy - sx*sy) / den : 0;
        icpt = (sy - slope*sx) / n;
      }
      let maxRes = 0, rms = 0;
      pts.forEach(([x,y]) => {
        const r = Math.abs(y - (slope*x + icpt));
        if (r > maxRes) maxRes = r;
        rms += r*r;
      });
      rms = n ? Math.sqrt(rms/n) : 0;
      return JSON.stringify({
        cols: n, slope: +slope.toFixed(4),
        degFromSlope: +(Math.atan(slope) * 180 / Math.PI).toFixed(2),
        maxResidualPx: +maxRes.toFixed(2), rmsResidualPx: +rms.toFixed(2),
        widthPx: w, heightPx: h
      });
    })()`));
  }

  for (const deg of [0, -25]) {
    await pin(deg);
    const r = await topEdge();
    console.log('钉住 car.a = ' + deg + '° → 上沿拟合斜率 ' + r.slope +
      '（≈' + r.degFromSlope + '°），采样列 ' + r.cols +
      '，最大残差 ' + r.maxResidualPx + 'px，RMS ' + r.rmsResidualPx + 'px');
  }

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

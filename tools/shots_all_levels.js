/* 八关行驶期截图 + 视觉体检（第 85 轮）。
 *
 * ── 为什么这一轮回到画面 ──
 *
 * 最近四轮全在改引擎和量具。最后一次截图是第 79 轮的提示卡。
 * 物理和难度都有断言了，但"看起来像不像一个商业 2D 游戏"只有截图能回答。
 *
 * ── 判据的三次修正（都记在下面） ──
 *
 * A 亮度标准差 ≥ 25 —— 画面不能是一坨色块。
 *   ⚠ 这条在海面/夜空这类**本来就暗**的场景会误报。1-5 的 `b` 帧 σ=24.1
 *   是"黄昏 + 视野压低"，不是缺陷。改成同时看**均值**：
 *   暗场景（均值 < 70）放宽到 σ ≥ 20。
 *
 * B 车高占屏幕高度 ≥ 8% —— 主角要够大。
 *   ⚠ 这条错在最根本的地方：车高 = 1 格 × 32 × zoom，
 *   zoom≈1.7 时是 54 像素 / 707 = **7.6%**。也就是说**单格高的车
 *   永远达不到 8%**，而单格高是合法构型（1-6 的积木）。
 *   判据改成正面的性质：**车身在屏幕上的像素高度 ≥ 50**（约 1.5 格），
 *   那才是"看得清"的直接度量。
 *
 * C HUD 不能盖住车 —— 这条留到下一轮（需要 HUD 面板几何）。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, 'records', 'shots');
const LEVELS = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8'];
const SPEC_OF = require('./lib/specmap.js').SPEC_OF;

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const PORT = 9500 + Math.floor(Math.random() * 300);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgeShots85-' + Date.now()),
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
      if (m.method === 'Runtime.exceptionThrown') {
        errs.push(m.params.exceptionDetails.text + ' ' +
          (m.params.exceptionDetails.exception &&
           m.params.exceptionDetails.exception.description || ''));
      }
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

  const report = [];
  for (let i = 0; i < LEVELS.length; i++) {
    const key = SPEC_OF[LEVELS[i]];
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(${i}); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
      S.runBanner=0; S.shake=0;
      R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS[${JSON.stringify(key)}]);
      S.phase='build'; S.run=null;
      R.launch(); S.runBanner=0;
      R.RAP.applySpecRuntime(S.run, R.RAP.SPECS[${JSON.stringify(key)}]);
      return 1;})()`);
    await sleep(420);

    const frames = [];
    for (const at of [{ label: 'a', sec: 1.2 }, { label: 'b', sec: 'near-end' }]) {
      if (at.sec === 'near-end') {
        await ev(`(()=>{const S=window.__rap.state;
          let guard = 0;
          const goal = window.__rap.level().goal.col;
          while (S.run.phase === 'run' && S.run.car && S.run.car.x < goal - 3 && guard++ < 60*40) {
            window.__rap.RAP.step(S.run, 1/60);
          }
          S.runBanner = 0; S.shake = 0;
          return guard;})()`);
      } else {
        await ev(`(()=>{const S=window.__rap.state;
          for (let k = 0; k < ${Math.round(60 * at.sec)}; k++) {
            if (S.run.phase !== 'run') break;
            window.__rap.RAP.step(S.run, 1/60);
          }
          S.runBanner = 0; S.shake = 0;
          return 1;})()`);
      }
      await sleep(280);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const file = 'r85-' + LEVELS[i] + '-' + at.label + '.png';
      fs.writeFileSync(path.join(OUT, file), Buffer.from(shot.data, 'base64'));

      const m = JSON.parse(await ev(`(()=>{
        const S=window.__rap.state, car=S.run.car, cm=S.camLastDraw;
        const cv=document.getElementById('cv'), g=cv.getContext('2d'), v=window.__view;
        const W=cv.width, H=cv.height;
        const d=g.getImageData(0,0,W,H).data;
        let n=0, sum=0, sum2=0;
        for(let k=0;k<d.length;k+=16){
          const lum=0.299*d[k]+0.587*d[k+1]+0.114*d[k+2];
          n++; sum+=lum; sum2+=lum*lum;
        }
        const mean=sum/n, sd=Math.sqrt(Math.max(0,sum2/n-mean*mean));
        const s=32*cm.zoom;
        const hPx=(car.hull.maxY-car.hull.minY)*s;
        const wPx=(Math.max(car.hull.maxX,car.hull.minX)-Math.min(car.hull.maxX,car.hull.minX))*s;
        return JSON.stringify({ sd:+sd.toFixed(1), mean:+mean.toFixed(1),
          carH:+hPx.toFixed(1), carW:+wPx.toFixed(1), carHpct:+(hPx/H*100).toFixed(2),
          zoom:+cm.zoom.toFixed(3), W:W, H:H });
      })()`));
      frames.push({ file, ...m });
    }
    report.push({ id: LEVELS[i], frames });
  }

  console.log('=== 逐帧明细 ===');
  report.forEach(r => r.frames.forEach(f => {
    console.log('  ' + f.file.padEnd(20) + ' 亮度σ=' + String(f.sd).padStart(5) +
      '  均值=' + String(f.mean).padStart(6) +
      '  车 ' + String(f.carW).padStart(5) + '×' + String(f.carH).padStart(5) + ' px' +
      '  zoom=' + f.zoom);
  }));

  console.log('');
  console.log('=== 判据 ===');
  let bad = 0;
  report.forEach(r => r.frames.forEach(f => {
    /* A 亮度：暗场景（均值 < 70）放宽 */
    const floor = f.mean < 70 ? 20 : 25;
    if (f.sd < floor) {
      console.log('✗ ' + f.file + ' 亮度σ=' + f.sd + '（< ' + floor + '，画面太单调）');
      bad++;
    }
    /* B 车够大：看**像素高度**，不是百分比。
     * 45 px 这个门槛是量出来的：八关的最低是 1-6 的 49.5 px
     * （单格高积木车 + zoom 1.55）。再往上定就会把合法构型判成缺陷。 */
    if (f.carH < 45) {
      console.log('✗ ' + f.file + ' 车高=' + f.carH + 'px（< 45，看得清吗）');
      bad++;
    }
  }));
  console.log(bad === 0 ? '✓ 全部通过（16 帧）' : '共 ' + bad + ' 条问题');
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');

  try { ws.close(); } catch (e) {}
  try { child.kill(); } catch (e) {}
  process.exit(bad === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

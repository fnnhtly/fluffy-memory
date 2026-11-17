/* 逐行扫视差：哪一行最能证明"山在动但动得少"。
 *
 * 上一版写死一条扫描线，结果那条线上可能全是雾或天空 —— 量具指错了地方。
 * 这一版把整幅图每隔 16px 扫一遍，逐行算"最佳位移"，然后打印出来，
 * 让数据自己说话：山体所在的行应当出现 0 < |shift| < 地形位移 的中间值。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9460 + Math.floor(Math.random() * 90);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeRow-' + Date.now()),
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

  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(400);

  // 取一整幅图，然后在 Node 里做互相关（比在页面里跑快）
  const grab = async () => JSON.parse(await ev(`(()=>{
    const cv=document.getElementById('cv'), g=cv.getContext('2d');
    const d = g.getImageData(0,0,cv.width,cv.height).data;
    // 压缩成每 4 像素一个采样点，只留灰度，减小传输量
    const W = Math.floor(cv.width/4), H = Math.floor(cv.height/4);
    const out = new Array(W*H);
    for (let y=0;y<H;y++) for (let x=0;x<W;x++){
      const i = ((y*4)*cv.width + x*4)*4;
      out[y*W+x] = Math.round(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]);
    }
    return JSON.stringify({W,H,px:out});
  })()`));

  await ev(`(()=>{const S=window.__rap.state; S.buildView.x = window.__rap.level().start.col + 6;
    window.__rap.clampBuildView(S.buildView, window.__rap.level()); return 1;})()`);
  await sleep(350);
  const A = await grab();
  await ev(`(()=>{const S=window.__rap.state; S.buildView.x += 3;
    window.__rap.clampBuildView(S.buildView, window.__rap.level()); return 1;})()`);
  await sleep(350);
  const B = await grab();

  console.log('frame', A.W + 'x' + A.H);

  function bestShift(row, maxShift) {
    let best = 0, bestErr = 1e18;
    for (let s = -maxShift; s <= maxShift; s++) {
      let err = 0, n = 0;
      for (let x = 0; x < A.W; x++) {
        const j = x + s;
        if (j < 0 || j >= B.W) continue;
        err += Math.abs(A.px[row * A.W + x] - B.px[row * B.W + j]);
        n++;
      }
      if (n < 40) continue;
      err /= n;
      if (err < bestErr) { bestErr = err; best = s; }
    }
    return { shift: best, err: +bestErr.toFixed(2) };
  }

  console.log('row(设计y)  shift(采样点)  残差');
  for (let row = 6; row < A.H - 2; row += 4) {
    const r = bestShift(row, 60);
    console.log(String(row * 4).padStart(6), String(r.shift).padStart(8), String(r.err).padStart(9));
  }

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

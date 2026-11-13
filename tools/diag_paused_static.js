/* 诊断：暂停后到底还有什么在动？把两帧做像素差分，输出变化区域与幅度。 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9431;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeDiag-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;

  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[2];
    window.__rap.startLevel(2); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-3']);
    window.__rap.launch();
  })()`);
  await sleep(2400);
  await ev(`(()=>{const s=window.__rap.state; s.paused=true; s.shake=0; s.slowmo=0;
    s.dust=[]; s.debris=[]; s.confetti=[]; return 1;})()`);
  await sleep(1200);

  const eva = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await sleep(3000);   // 等镜头跟随也停下来

  // 抓两帧像素，在页面里比较（避免传大数组）
  const res = JSON.parse(await eva(`(async () => {
    const cv = document.getElementById('cv'), g = cv.getContext('2d');
    const grab = () => g.getImageData(0, 0, cv.width, cv.height).data.slice();
    const a = grab();
    await new Promise(r => setTimeout(r, 320));
    const b = grab();
    let n = 0, maxD = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    const W = cv.width, H = cv.height;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2]);
      if (d > 12) {
        n++;
        const px = (i/4) % W, py = Math.floor((i/4)/W);
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
        if (d > maxD) maxD = d;
      }
    }
    return JSON.stringify({ W, H, changed: n, maxD,
      box: n ? [minX, minY, maxX, maxY] : null,
      frac: +(n / (W*H) * 100).toFixed(3) });
  })()`));
  console.log('分辨率', res.W + 'x' + res.H);
  console.log('变化像素', res.changed, '(' + res.frac + '%) 最大差', res.maxD);
  console.log('变化包围盒', res.box);

  const st = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
    return JSON.stringify({paused:s.paused, phase:s.phase, replayT:s.replayT,
      camState:s.camState, dust:(s.dust||[]).length, t:s.run&&s.run.time});})()`));
  console.log('state', JSON.stringify(st).slice(0, 400));

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e); process.exit(1); });

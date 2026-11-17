/* 直接截图看：拼装区里的车，零件之间到底连不连。
 * 前面几版的探针都靠"逐列扫颜色/差分"，容易被列位置和抗锯齿骗；
 * 这一版只做一件事：把车放大截一张图，人眼看。
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, 'records', 'shots');

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const PORT = 9700 + Math.floor(Math.random() * 90);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeShot-' + Date.now()),
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

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  /* 建造期：1-6 的标准解摆进拼装区，然后放大镜头截一张 */
  await ev(`(()=>{const R=window.__rap, S=R.state;
    R.startLevel(5); S.welcome=0; S.introT=1; S.phase='build'; S.run=null; S.runBanner=0;
    R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-6']);
    S.camState.zoom = 2.6;
    return 1;})()`);
  await sleep(1400);

  let r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'r70-build-zoom.png'), Buffer.from(r.data, 'base64'));
  console.log('saved r70-build-zoom.png');

  /* 行驶期同款车，也来一张 */
  await ev(`(()=>{const R=window.__rap, S=R.state;
    R.launch(); S.runBanner=0; S.run.phase='frozen';
    S.run.car.parts.forEach(p => { if (p.def && p.def.tool) p.powered = false; });
    S.windFx=[]; S.windAcc=0; S.dust=[]; S.bursts=[]; S.confetti=[]; S.debris=[]; S.shake=0;
    S.camState.zoom = 2.6;
    return 1;})()`);
  await sleep(1800);
  r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'r70-run-zoom.png'), Buffer.from(r.data, 'base64'));
  console.log('saved r70-run-zoom.png');

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

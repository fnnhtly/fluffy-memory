/* 截一张「车身倾斜时零件不再各自旋转」的对照图（第 76 轮）。
 *
 * 一张图里放同一辆车在 0° / 20° / -20° 三个倾角下的样子 ——
 * 修好之后三张车的**形状必须一样**，只是整体转了角度。
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
  const PORT = 9200 + Math.floor(Math.random() * 70);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeRigidShot-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  for (const deg of [0, 20, -20]) {
    const a = deg * Math.PI / 180;
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(0); S.welcome=0; S.introT=1; S.phase='build'; S.run=null; S.runBanner=0;
      R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-1']);
      S.phase='build'; S.run=null; R.launch(); S.runBanner=0;
      S.run.phase='frozen';
      S.run.car.a=${a}; S.run.car.vx=0; S.run.car.vy=0; S.run.car.w=0; S.run.car.odo=0;
      S.windFx=[]; S.dust=[]; S.bursts=[]; S.confetti=[]; S.debris=[]; S.shake=0;
      return 1;})()`);
    await sleep(1400);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    const tag = deg === 0 ? 'a0' : (deg > 0 ? 'a20' : 'am20');
    fs.writeFileSync(path.join(OUT, 'r76-rigid-' + tag + '.png'), Buffer.from(s.data, 'base64'));
    console.log('saved r76-rigid-' + tag + '.png');
  }

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

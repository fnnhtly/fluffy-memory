/* 一整段的行驶过程：起步 → 加速 → 到终点。这是"车真的能开"的端到端判据。
 *
 * 原来把 14 帧状态打印出来就 exit 0 —— 车原地不动也算通过。
 * 现在要求：位移足够、速度真的升起过、镜头跟着车走、最终判定为 win。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeDq-' + Date.now()),
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

  // 1-3 有马达，跑得久
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[2];
    window.__rap.startLevel(2); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-3']);
    window.__rap.launch();
  })()`);
  const startX = await ev('window.__rap.state.run.car.x');
  const goalX = await ev('window.__rap.level().goal.col + 0.5');

  const frames = [];
  let maxVx = 0, camMoved = 0;
  const cam0 = await ev('window.__rap.state.camState.x');
  for (let i = 0; i < 90; i++) {
    await sleep(160);
    const f = JSON.parse(await ev(`(()=>{const r=window.__rap.state.run; if(!r) return 'null';
      return JSON.stringify({x:+r.car.x.toFixed(2), vx:+r.car.vx.toFixed(2),
        camx:+window.__rap.state.camState.x.toFixed(2),
        boxes:r.boxesGot, t:+r.time.toFixed(2), ph:r.phase, res:r.result||''});})()`));
    if (!f) break;
    frames.push(f);
    if (Math.abs(f.vx) > maxVx) maxVx = Math.abs(f.vx);
    if (Math.abs(f.camx - cam0) > camMoved) camMoved = Math.abs(f.camx - cam0);
    if (i === 3) await shot('dq-early');
    if (f.ph === 'resolved') break;
  }

  const last = frames[frames.length - 1];
  A.log('采样 ' + frames.length + ' 帧，起点 x=' + startX.toFixed(2) +
    ' 终点 x=' + last.x + ' 目标 x=' + goalX.toFixed(2) + ' 最高 |vx|=' + maxVx.toFixed(2));

  A.chk('车真的往前走了（位移 > 3 米）', last.x - startX > 3,
    (last.x - startX).toFixed(2) + ' 米');
  A.chk('中途真的加速过（|vx| 峰值 > 1 m/s）', maxVx > 1, maxVx.toFixed(2) + ' m/s');
  A.chk('镜头跟着车走了（跟随 > 2 米）', camMoved > 2, camMoved.toFixed(2) + ' 米');
  A.chk('最终判定为胜利', last.res === 'win', 'result=' + last.res + ' phase=' + last.ph);
  A.chk('结算时确实到了终点附近',
    Math.abs(last.x - goalX) < 3.0, '距终点 ' + Math.abs(last.x - goalX).toFixed(2) + ' 米');
  await shot('dq-final');

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

/* 调试：浏览器里 launch() 造出来的车，为什么跑不动？
 *
 * 现象：node 里同一份 SPECS['1-1'] 6.17 s 通关，浏览器里 12 秒只前进 0.13 米
 * （x 1.50 → 1.63），于是看门狗在 8 秒判 no_progress，结算页永远出不来。
 *
 * 所以要比的是**同一个状态**在两边的差别：零件表 / 质量 / 轮子 / 接触。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeEC-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  const info = JSON.parse(await ev(`(()=>{const s=window.__rap.state, R=window.__rap.RAP;
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(window.__rap.levels[0], s.build, R.SPECS['1-1']);
    const cells=Object.keys(s.build.cells).map(k=>k+':'+s.build.cells[k].part);
    window.__rap.launch();
    const car=s.run.car;
    return JSON.stringify({
      cells, start:window.__rap.levels[0].start,
      carX:car.x, carY:car.y, mass:car.mass,
      parts:car.parts.map(p=>p.part+':'+(p.n||1)+'@'+p.lx.toFixed(2)+','+p.ly.toFixed(2)),
      wheels:car.wheels.map(w=>w.def?w.def.mass:JSON.stringify(w).slice(0,40)),
      hull:car.hull, surfaceY: s.run.terrain.surfaceY(car.x)
    });})()`));
  console.log(JSON.stringify(info, null, 1));
  await sleep(1200);
  const after = JSON.parse(await ev(`(()=>{const s=window.__rap.state,r=s.run;
    return JSON.stringify({t:r.time, x:r.car.x, y:r.car.y, vx:r.car.vx, vy:r.car.vy,
      noGainFor:r.noGainFor, phase:r.phase, result:r.result, reason:r.failReason});})()`));
  console.log('\n1.2 秒后：' + JSON.stringify(after));

  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

/* 1-6 的终点旗被 HUD 盖住 24 帧，是哪几帧（第 86 轮）。
 *
 * 用渲染层公式算镜头，逐帧记录"旗是否落在 HUD 矩形里"，并打印 t / 车 x / 旗的屏幕坐标。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SPEC_OF = require('./lib/specmap.js').SPEC_OF;

(async () => {
  const PORT = 9800 + Math.floor(Math.random() * 150);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgeFlag86-' + Date.now()),
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
  const ev = async e => {
    const r = await send('Runtime.evaluate',
      { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error((d.exception && d.exception.description) || d.text);
    }
    return r.result.value;
  };
  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  const key = SPEC_OF['1-6'];
  const rows = JSON.parse(await ev(`(()=>{const R=window.__rap, S=R.state;
    R.startLevel(5); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
    S.runBanner=0; S.shake=0;
    R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS[${JSON.stringify(key)}]);
    S.phase='build'; S.run=null; R.launch(); S.runBanner=0;
    R.RAP.applySpecRuntime(S.run, R.RAP.SPECS[${JSON.stringify(key)}]);
    const pr=R.runProgressRect(), tr=R.runTimeRects();
    const panels = [pr.panel, tr.timer, tr.box, tr.frame, R.runChallengeRect()];
    ['pause','restartRun'].forEach(n => { const r=R.btnRect(n); if(r) panels.push(r); });
    const camAt = (car, ter) => { const spd=Math.hypot(car.vx,car.vy);
      return { x: car.x+2.0+Math.min(1.6,spd*0.14),
               y: Math.max(car.y, ter.surfaceY(car.x))+1.5,
               zoom: 1.85-Math.min(0.45,spd*0.035) }; };
    const out=[]; let f=0;
    while (S.run.phase==='run' && f < 60*40) {
      if (f > 20) {
        const car=S.run.car, ter=S.run.terrain, cm=camAt(car,ter), s=32*cm.zoom;
        const goalCol=R.level().goal.col;
        const ggx=640+(goalCol-cm.x)*s;
        const gyy=360-(R.RAP.groundY(S.run, goalCol+0.5)-cm.y)*s;
        const hit=panels.some(p=>ggx>p.x&&ggx<p.x+p.w&&gyy>p.y&&gyy<p.y+p.h);
        if (hit) out.push({ t:+S.run.time.toFixed(2), carX:+car.x.toFixed(1),
          flagX:+ggx.toFixed(0), flagY:+gyy.toFixed(0) });
      }
      R.RAP.step(S.run, 1/60); f++;
    }
    return JSON.stringify({ rows: out.slice(0,30), total: out.length,
      goalCol: R.level().goal.col });})()`));

  console.log('1-6 终点 col=' + rows.goalCol + '，旗被 HUD 盖住 ' + rows.total + ' 帧');
  console.log('t      车x     旗屏幕坐标');
  rows.rows.forEach(r => console.log(
    String(r.t).padEnd(7) + String(r.carX).padEnd(8) + '(' + r.flagX + ',' + r.flagY + ')'));

  try { ws.close(); } catch (e) {}
  try { require('./lib/asserts.js').killTree(child); } catch (e) {}
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

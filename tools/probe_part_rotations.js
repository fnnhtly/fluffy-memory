/* 钩 ctx.translate + ctx.rotate，按顺序配对，反推「每件零件被画时的旋转角」。
 *
 * drawPartShape 的结构是固定的：
 *   translate(cx, cy) → rotate(dir * PI/2) → ... 画 ... → restore()
 * 所以每一对 (translate, rotate) 就是一件零件的姿态。用这个就能回答
 * 「零件是不是各自旋转」，而不需要改产品代码去打日志。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const PORT = 9300 + Math.floor(Math.random() * 90);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeRotSeq-' + Date.now()),
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

  for (const ang of [0, -0.52]) {
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(0); S.welcome=0; S.introT=1; S.phase='build'; S.run=null; S.runBanner=0;
      R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-1']);
      S.phase='build'; S.run=null; R.launch(); S.runBanner=0;
      S.run.phase='frozen';
      S.run.car.a = ${ang}; S.run.car.vx=0; S.run.car.vy=0; S.run.car.w=0;
      S.odo = 0;
      S.run.car.odo = 0;
      S.windFx=[]; S.dust=[]; S.bursts=[]; S.confetti=[]; S.debris=[]; S.shake=0;
      return 1;})()`);
    await sleep(1200);
    await ev(`(()=>{const S=window.__rap.state;
      const cm=S.camLastDraw||S.camLive;
      S.__lockCam={x:cm.x,y:cm.y,zoom:cm.zoom}; return 1;})()`);
    await sleep(400);

    /* 钩一个帧周期内的 translate / rotate 序列 */
    await ev(`(()=>{
      const P = CanvasRenderingContext2D.prototype;
      if (!window.__origT) {
        window.__origT = P.translate;
        window.__origR = P.rotate;
        P.translate = function (x, y) { window.__seq = window.__seq || []; window.__seq.push(['T', x, y]); return window.__origT.call(this, x, y); };
        P.rotate = function (a) { window.__seq = window.__seq || []; window.__seq.push(['R', a]); return window.__origR.call(this, a); };
      }
      window.__seq = [];
      window.__seqOn = true;
      return 1;})()`);
    await sleep(360);
    const seq = JSON.parse(await ev(`(()=>{
      window.__seqOn = false;
      return JSON.stringify((window.__seq || []).slice(0, 200));})()`));

    /* 配对：T 后面紧跟的 R 就是那件零件的旋转 */
    const pairs = [];
    for (let i = 0; i < seq.length - 1; i++) {
      if (seq[i][0] === 'T' && seq[i + 1][0] === 'R') {
        pairs.push({ x: +seq[i][1].toFixed(1), y: +seq[i][2].toFixed(1),
          rot: +seq[i + 1][1].toFixed(4) });
      }
    }
    const uniq = [...new Set(pairs.map(p => p.rot))].sort((a, b) => a - b);
    console.log('');
    console.log('=== car.a = ' + ang + '（' + (ang * 180 / Math.PI).toFixed(0) + '°）===');
    console.log('  零件绘制次数 ' + pairs.length + '，旋转角去重：' + uniq.join(', '));
    pairs.forEach(p => console.log('    (' + p.x + ',' + p.y + ')  rot=' + p.rot +
      '  = ' + (p.rot * 180 / Math.PI).toFixed(1) + '°'));
  }

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

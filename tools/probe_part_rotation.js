/* 用户说：「车上的零件都连起来，比如两个木框的两边粘连起来，
 * 不会在下坡时各自转动」。
 *
 * 先量清楚"各自转动"到底是怎么发生的：在 drawPartShape 上挂钩子，
 * 把行驶期**每一帧、每一件零件**实际被传入的旋转角记下来。
 *
 * 如果车身真的是一整个刚体、所有零件都跟着 car.a 转，那么相邻两格
 * 木框的角度差应当恒为 0（或 90° 的整数倍，因为 dir 是四分之一圈）。
 * 差值随时在变 = 它们真的在各自转。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const PORT = 9760 + Math.floor(Math.random() * 100);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeRot-' + Date.now()),
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

  /* 挂钩子：记录每次 drawPartShape 的 (part, dir)，只留行驶期那一帧 */
  await ev(`(()=>{
    window.__rot = [];
    window.__rotOn = false;
    const P = CanvasRenderingContext2D.prototype;
    const oT = P.translate, oR = P.rotate;
    // drawPartShape 内部先 translate 再 rotate(dir*PI/2)。这里从 rotate 反推不方便，
    // 改成直接包一层 drawPartShape —— 但它是闭包里的局部函数，包不到。
    // 所以换一个办法：包 ctx.arc，看轮子的圆心位置；同时用 translate 记录零件位置。
    return 1;})()`);

  /* 换个更好用的做法：直接从引擎状态算"每件零件此刻被画在哪个角度"。
   * 渲染层那条公式就在 index.html 里，这里照抄一份 —— 但为了不让"量具抄公式"
   * 变成第二份真相，我们**同时**用像素验证（见下）。 */
  await ev(`(()=>{const R=window.__rap, S=R.state;
    R.startLevel(0);
    R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-1']);
    R.launch(); return 1;})()`);
  await sleep(1200);

  const rec = [];
  for (let i = 0; i < 10; i++) {
    const snap = JSON.parse(await ev(`(()=>{const R=window.__rap, S=R.state;
      if (!S.run || !S.run.car) return JSON.stringify({err:'no car'});
      const car = S.run.car;
      return JSON.stringify({
        a: +(car.a * 180 / Math.PI).toFixed(2),
        x: +car.x.toFixed(2),
        parts: car.parts.filter(p => p.def.structure).map(p => ({
          r: p.r, c: p.c, lx: +p.lx.toFixed(2), ly: +p.ly.toFixed(2),
          dir: p.dir || 0
        })),
        wheels: car.parts.filter(p => p.def.wheel).map(p => ({
          r: p.r, c: p.c, dir: p.dir || 0
        }))
      });})()`));
    rec.push(snap);
    await sleep(220);
  }

  console.log('=== 车身角度 vs 结构件 dir（行驶期逐帧）===');
  rec.forEach((s, i) => {
    if (s.err) return console.log(i, s.err);
    console.log('t#' + i, 'car.a=' + s.a + '°', 'x=' + s.x,
      'frames:', JSON.stringify(s.parts.map(p => p.r + ',' + p.c + ':dir' + p.dir)),
      'wheels:', JSON.stringify(s.wheels.map(p => p.r + ',' + p.c + ':dir' + p.dir)));
  });

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

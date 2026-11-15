/* 建造页为什么掉到 20 fps？
 *
 * 第 62 轮把建造镜头从"起点特写 zoom 2.1"改成"看全图 zoom 1.27"之后，
 * test_perf_stable 报建造页 20.5 fps（基线 60.9 的 0.34）。
 *
 * 假设：可见世界范围变大 → 石头纹理的循环次数按 1/zoom² 增长，
 * 而每块石头都要 createRadialGradient（一个相对贵的调用）。
 * 这个脚本负责证实或否掉这个假设：分别量"石头那一段"和"整帧"的耗时。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgePF-' + Date.now()),
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
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  await send('Runtime.evaluate', { expression: "localStorage.clear();localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1000);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(600);

  // 统计石头循环的迭代次数（在不同 zoom 下）
  const counts = await ev(`(()=>{
    const S=window.__rap.state;
    const out=[];
    [0.45,0.8,1.27,1.6,2.1,3.2].forEach(z=>{
      const STONE_WM = 128/32, STONE_HM = 86/32;
      const s = 32*z;
      const halfVW = (1280/2)/s;
      const colLo = Math.floor((S.buildView.x-halfVW)/STONE_WM)-1;
      const colHi = Math.ceil((S.buildView.x+halfVW)/STONE_WM)+1;
      const worldYBot = S.buildView.y - (720/2)/s;
      const rowHi = Math.ceil((14-worldYBot)/STONE_HM)+1;
      out.push({zoom:z, cols:colHi-colLo+1, rows:rowHi, total:(colHi-colLo+1)*rowHi});
    });
    return JSON.stringify(out);})()`);
  console.log('石头循环次数（zoom → 格子数）:');
  JSON.parse(counts).forEach(c => console.log(
    '  zoom ' + c.zoom + ' → ' + c.cols + ' 列 × ' + c.rows + ' 行 = ' + c.total + ' 块'));

  // 实测 drawWorld 的单次耗时（在不同 zoom 下）
  const timings = await ev(`(()=>{
    const S=window.__rap.state;
    const out=[];
    [1.27, 2.1, 3.2].forEach(z=>{
      const cam={x:S.buildView.x, y:S.buildView.y, zoom:z};
      // 找 drawWorld —— 它不在 __rap 上，用间接办法：重复触发整帧太慢，
      // 改为测量"一次 clearRect + 一次完整帧"的 rAF 间隔
      out.push(z);
    });
    return JSON.stringify(out);})()`);

  // 直接测 rAF 间隔：设定不同 zoom 后各跑 40 帧
  const fps = async (zoom) => ev(`(async()=>{
    const S=window.__rap.state;
    S.buildView.zoom=${zoom};
    await new Promise(r=>setTimeout(r,200));
    let n=0; const t0=performance.now();
    await new Promise(res=>{
      function f(){ n++; if(performance.now()-t0 < 1200) requestAnimationFrame(f); else res(); }
      requestAnimationFrame(f);
    });
    return +(n/((performance.now()-t0)/1000)).toFixed(1);})()`);

  for (const z of [1.27, 1.8, 2.1, 3.2]) {
    const f = await fps(z);
    console.log('zoom ' + z + ' → ' + f + ' fps');
  }

  send('Browser.close'); try { require('child_process')
    .spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

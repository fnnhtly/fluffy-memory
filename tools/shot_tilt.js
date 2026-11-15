/* 截图：1-2 跑动中，确认车体是**贴着坡面**的，不是横在坡上像散架。
 * 用户截图里 1-2 的车歪了约 45°，而地面只有十几度 —— 看上去像零件散开。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeTL-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1500);
  await send('Runtime.evaluate', { expression:
    "localStorage.clear(); localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1800);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;
  /* `window.__rap` 是文件末尾才挂上去的；如果页面还在解析就调用，
   * 读到的是 `undefined.state`（这一版第一跑就是 'ERR:Cannot read
   * properties of undefined (reading 'state')'）。
   * 所以先**等它出现**再动手，而不是靠一个猜的 sleep 时长。 */
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    ready = await ev('typeof window.__rap === "object" && !!window.__rap.state');
    if (!ready) await sleep(150);
  }
  console.log('__rap 就绪：' + ready);
  if (!ready) { console.log('FAIL 页面没有初始化'); process.exit(1); }
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }

  // 1-2 跑到中段（用户截图那一刻大约在 x=9~13）
  await ev(`(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1;
    window.__rap.launchSpec(1, '1-2'); s.runBanner=0; return 1;})()`);
  await sleep(1800);

  /* 读车姿态。用**一个自包含的函数**，任何一步取不到就返回字符串，
   * 不在 JS 里 JSON.parse 一个可能是 "" 的返回值 ——
   * 第一版就是这么崩的（`"undefined" is not valid JSON`）。 */
  const pose = () => ev(`(()=>{
    try {
      const S = window.__rap.state;
      if (!S || !S.run || !S.run.car) return 'NONE';
      const c = S.run.car;
      const sl = S.run.terrain.surfaceSlope(c.x);
      const carDeg = c.a * 180 / Math.PI;
      const slopeDeg = Math.atan(sl) * 180 / Math.PI;
      return JSON.stringify({ x: +c.x.toFixed(1),
        carDeg: +carDeg.toFixed(1), slopeDeg: +slopeDeg.toFixed(1),
        diff: +(carDeg - slopeDeg).toFixed(1),
        result: S.run.result || '-' });
    } catch (e) { return 'ERR:' + e.message; }
  })()`);

  const midRaw = await pose();
  console.log('中段：' + midRaw);
  await shot('tl-01-running-1-2');

  // 再等一会（用户截图差不多 t=2.3 之后翻掉的那段）
  await sleep(1200);
  const lateRaw = await pose();
  console.log('后段：' + lateRaw);
  await shot('tl-02-running-late');

  /* 断言：车体倾角和坡度的差不该超过 30°。
   * 用户截图那一刻实测是 -45° 左右（车横过来了），修好之后应该在 20° 内。 */
  const parse = s => (s && s[0] === '{') ? JSON.parse(s) : null;
  const late = parse(lateRaw);
  if (!late) { console.log('⚠ 读不到姿态，跳过断言'); }
  else if (Math.abs(late.diff) > 30) {
    console.log('✗ 车体偏离坡度 ' + late.diff + '°（> 30°）—— 看起来像要翻');
    process.exitCode = 1;
  } else {
    console.log('✓ 车体贴合坡度（偏离 ' + late.diff + '°）');
  }

  send('Browser.close'); try { require('child_process')
    .spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {}
  process.exit(process.exitCode || 0);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

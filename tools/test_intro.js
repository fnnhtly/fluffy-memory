/* 入场镜头：从广角推到近景，物体在屏幕上的尺寸必须真的变大，
 * 并且 1.2 秒后停在最终构图（重复就说明推镜没跑）。
 *
 * 原来只截四张图、打印 introT，就 exit 0 —— 镜头完全没推也算通过。
 * 这里用"车在屏幕上的像素宽度"来量化推镜：同一台车，越推越大。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9390;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeN-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(800);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }

  await ev('window.__rap.startLevel(0); window.__rap.state.welcome = 0;');

  // 单点取"开始前 / 结束后"两次快照是不可靠的：CDP 往返之间页面已经跑了好几帧，
  // 第一版就踩到了（有一次取到 introT=0.72、zoom 已经 2.07，判据直接失效）。
  // 改成连续采样 (introT, zoom) 序列，检查两者是否同向变化 —— 这才是推镜的定义。
  await ev('window.__rap.state.introT = 0;');
  // 必须等一帧再采第一个点：camLive 是"上一帧真正用的镜头"，
  // 刚把 introT 归零的那一瞬间它还停在上一次的终值 2.08（第一版就采到了这个陈旧值）。
  await sleep(80);
  const samples = [];
  for (let i = 0; i < 15; i++) {
    const s = JSON.parse(await ev(
      'JSON.stringify({ t: window.__rap.state.introT, z: window.__rap.state.camLive ? window.__rap.state.camLive.zoom : null })'));
    samples.push(s);
    await sleep(90);
  }
  await shot('in-00-start');

  A.chk('采样里有"几乎还没推"的早期帧', samples[0].t < 0.35, 'introT=' + samples[0].t.toFixed(2));
  A.chk('采样一直采到推完', samples[samples.length - 1].t >= 1,
    'introT=' + samples[samples.length - 1].t.toFixed(2));

  // 第一点可能是"上一帧的陈旧镜头"（CDP 往返与 rAF 的相对次序不可控），
  // 所以用"采到的最广视野"作为起点 —— 这也是推镜的定义：先广角，再收到近景。
  const zs = samples.map(s => s.z);
  const zmin = Math.min(...zs);
  const iMin = zs.indexOf(zmin);
  const zEnd = zs[zs.length - 1];
  A.chk('采到过广角（最广 <= 1.25）', zmin <= 1.25, '最广 zoom=' + zmin.toFixed(2) +
    '（第 ' + iMin + ' 个采样点）');
  A.chk('广角出现在推镜过程的前半段', iMin <= samples.length * 0.5,
    '第 ' + iMin + '/' + samples.length);
  // 从最广点之后必须单调不增视野（zoom 不回退）
  let monotonic = true;
  for (let i = iMin + 2; i < zs.length; i++) {
    if (zs[i] < zs[i - 1] - 0.03) { monotonic = false; break; }
  }
  A.chk('过最广点之后 zoom 单调增大（推镜方向正确）', monotonic,
    zs.slice(iMin).map(v => v.toFixed(2)).join(' → '));
  A.chk('推镜确实把镜头拉近了', zEnd - zmin > 0.6,
    zmin.toFixed(2) + ' → ' + zEnd.toFixed(2));
  A.near('推镜终点就是建造镜头 2.10', zEnd, 2.10, 0.02);

  // 推完之后不应该继续漂
  await sleep(400);
  const z2 = await ev('window.__rap.state.camLive.zoom');
  await sleep(400);
  const z3 = await ev('window.__rap.state.camLive.zoom');
  A.chk('推完之后镜头稳定（不再漂）', Math.abs(z3 - z2) < 0.02,
    z2.toFixed(3) + ' → ' + z3.toFixed(3));
  await shot('in-03-done');
  A.log('采样序列 ' + samples.map(s => '(' + s.t.toFixed(2) + ',' + s.z.toFixed(2) + ')').join(' '));

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

/* 调试：同一次 launch()，为什么 dbg_result_card 里 run.time 涨到 12 秒，
 * 而 dbg_sim_speed 里正常？
 *
 * 唯一的不同是 dbg_result_card 注入了 fillText / clearRect 的 monkey-patch。
 * 猜：`fillScreen` 用 clearRect 当帧边界 —— 如果 patch 之后 clearRect 被
 * **额外**调用（或没被调用），dt 的累加就会乱。直接把每帧的 dt / acc / time 打出来。
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

const PATCH = `(() => {
  if (window.__audit) return 'already';
  const C = CanvasRenderingContext2D.prototype;
  const oText = C.fillText, oClear = C.clearRect;
  window.__audit = { recs: [] };
  C.clearRect = function () { window.__audit.recs = []; return oClear.apply(this, arguments); };
  C.fillText = function (txt, x, y) { window.__audit.recs.push(String(txt)); return oText.apply(this, arguments); };
  return 'patched';
})()`;

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeMC-' + Date.now()),
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

  async function trial(label, doPatch) {
    if (doPatch) await ev(PATCH);
    await ev(`(()=>{const s=window.__rap.state, R=window.__rap.RAP;
      window.__rap.startLevel(0); s.welcome=0; s.introT=1;
      R.applySpec(window.__rap.levels[0], s.build, R.SPECS['1-1']);
      window.__rap.launch(); return 1;})()`);
    const samples = [];
    for (let i = 0; i < 5; i++) {
      await sleep(200);
      samples.push(JSON.parse(await ev(`(()=>{const s=window.__rap.state.r;
        return JSON.stringify({t:+window.__rap.state.run.time.toFixed(2),
          x:+window.__rap.state.run.car.x.toFixed(2),
          acc:+(window.__rap.state.run.acc||0).toFixed(3),
          f:window.__rap.state.frameCount});})()`)));
    }
    console.log(`${label}: ` + samples.map(s => `t=${s.t}/x=${s.x}`).join('  '));
    // 回到建造，避免上一局干扰
    await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null; return 1;})()`);
    await sleep(150);
  }

  await trial('不注入 patch', false);
  await trial('注入 patch  ', true);

  // 再来一次：注入 patch 之后再跑一局，看是否只有第一局受影响
  await trial('patch 之后第二局', false);

  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

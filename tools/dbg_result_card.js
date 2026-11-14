/* 调试：结算卡为什么没画出来？
 *
 * 排版审计报「找不到浮层标记「到达终点」——审计无效」，
 * 说明那一帧压根没画出结算卡。这里用和审计同样的手法（注入 fillText 记录）
 * 把最后一帧的文字全部打出来，再看 state 到底停在哪。
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
  C.fillText = function (txt, x, y) {
    window.__audit.recs.push(String(txt));
    return oText.apply(this, arguments);
  };
  return 'patched';
})()`;
const SNAP = 'JSON.stringify(window.__audit.recs.map(t => ({t})))';

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeRC-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  await ev(PATCH);
  await ev('window.__rap.state.introT = 1');
  await sleep(200);

  // 用标准解直接造车（不模拟鼠标，避免把审计的点击问题混进来）
  const ok = await ev(`(()=>{const s=window.__rap.state, R=window.__rap.RAP;
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(window.__rap.levels[0], s.build, R.SPECS['1-1']);
    const c=R.canLaunch(s.build);
    if(!c.ok) return 'canLaunch 失败：'+c.reason;
    window.__rap.launch();
    s.run.__born = { wall: performance.now(), time: s.run.time };
    return 'ok';})()`);
  console.log('发射：' + ok);
  for (let i = 0; i < 8; i++) {
    await sleep(200);
    const w0 = Date.now();
    console.log('  +' + ((i + 1) * 200) + 'ms  ' + await ev(`(()=>{const r=window.__rap.state.run;
      return 't='+r.time.toFixed(2)+' x='+r.car.x.toFixed(2)+' vx='+r.car.vx.toFixed(2)+
        ' phase='+r.phase+' res='+(r.result||'-')+' reason='+(r.failReason||'-')+
        ' noGain='+(r.noGainFor||0).toFixed(1)+
        ' | 出生至今墙钟='+((performance.now()-r.__born.wall)/1000).toFixed(2)+'s'+ 
        ' 同一 run=' + (r === window.__rap.state.run);})()`) +
      ' [ev 耗时 ' + (Date.now() - w0) + 'ms]');
  }

  // 就紧贴强制 win 之前再采一次：如果这里已经跳到 12 秒，说明是"采样之后"自然跑掉的
  console.log('  强制前：' + await ev(`(()=>{const r=window.__rap.state.run;
    return 't='+r.time.toFixed(2)+' x='+r.car.x.toFixed(2)+' f='+window.__rap.state.frameCount+
      ' 墙钟='+((performance.now()-r.__born.wall)/1000).toFixed(2)+'s';})()`));

  await ev(`(()=>{const s=window.__rap.state; s.run.result="win"; s.run.stars=2; s.run.time=12.34;
    s.phase="resolved"; s.resultT=1; return 1;})()`);
  await sleep(700);

  const st = await ev(`(()=>{const s=window.__rap.state, P=window.__rap.RAP.Params;
    return JSON.stringify({phase:s.phase, resultT:s.resultT, replayT:s.replayT,
      runPhase:s.run.phase, runResult:s.run.result, runReason:s.run.failReason,
      runTime:s.run.time, noGainFor:s.run.noGainFor, lastGain:s.run.progLastGainT,
      carX:s.run.car.x, progWindow:P.progressWindow, progGain:P.progressGain,
      replayLen:(s.run.replay||[]).length});})()`);
  console.log('强制 win 后：' + st);

  const recs = JSON.parse(await ev(SNAP));
  console.log('最后一帧文字（' + recs.length + ' 条）：');
  recs.forEach(r => console.log('  「' + r.t + '」'));
  console.log('errors:', errs.length ? errs : '(none)');

  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

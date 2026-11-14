/* 结算页必须真的能出现 —— 而且**不许被引擎自己覆盖掉**。
 *
 * 起因（第 39 轮）：加了 no_progress 看门狗之后，排版审计和对比度审计双双失败，
 * 报「找不到浮层标记「到达终点」」。两个审计都是用同一种手法造结算页的：
 *
 *     s.run.result="win"; s.run.time=12.34; s.phase="resolved";
 *
 * 问题在于当时主循环只判 `state.run.phase === 'run'` 就继续推进物理，
 * 而 state.phase 与 run.phase 已经不同步 → 底下的这一局还在 tick，
 * 看门狗拿着被外部改过的 time 一算 noGainFor = 12.3 s > 8 s，当场判 no_progress，
 * 把刚设好的 win 覆盖成 fail。结算卡于是永远画不出来。
 *
 * 这条测试守的是根因，不是症状：
 *   1) 状态被外部改成 resolved 之后，物理**必须停**（run.time 不再涨）；
 *   2) 结算卡必须出现，且 run.result 保持 win；
 *   3) 真实跑完一局仍然能正常结算（防止把主循环改死）。
 *
 * 注意第 1 条要用「同一时刻的先后两次采样」比，不能拿绝对时间比 ——
 * 见 tools/test_progress_watchdog.js 里"测试测到了自己"的教训。
 */
const A = require('./lib/asserts');
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
  C.fillText = function (txt) { window.__audit.recs.push(String(txt)); return oText.apply(this, arguments); };
  return 'patched';
})()`;

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeRS-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page');
      if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
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

  // ---------- 1. 被外部改成 resolved 之后，物理必须停 ----------
  await ev(`(()=>{const s=window.__rap.state, R=window.__rap.RAP;
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(window.__rap.levels[0], s.build, R.SPECS['1-1']);
    window.__rap.launch(); return 1;})()`);
  await sleep(500);
  const liveTime = await ev('window.__rap.state.run.time');
  A.chk('发射后物理在推进（前提成立，否则下面的断言无意义）', liveTime > 0.2,
    't=' + liveTime.toFixed(2));

  await ev(`(()=>{const s=window.__rap.state; s.run.result="win"; s.run.stars=2;
    s.run.time=12.34; s.phase="resolved"; s.resultT=1; return 1;})()`);
  const tA = await ev('window.__rap.state.run.time');
  await sleep(500);
  const tB = await ev('window.__rap.state.run.time');
  A.chk('状态改成 resolved 后物理停下（run.time 不再涨）',
    Math.abs(tB - tA) < 1e-9, tA.toFixed(2) + ' → ' + tB.toFixed(2));

  // ---------- 2. 结算卡必须出现，win 不被覆盖 ----------
  const after = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
    return JSON.stringify({phase:s.phase, result:s.run.result, reason:s.run.failReason||'',
      time:s.run.time, noGainFor:s.run.noGainFor||0});})()`));
  A.chk('run.result 仍是 win（没被看门狗改判）', after.result === 'win',
    after.result + ' / reason=' + (after.reason || '-'));
  A.chk('run.time 保持外部设的 12.34（没被物理继续改写）',
    Math.abs(after.time - 12.34) < 1e-6, after.time.toFixed(3));

  const recs = JSON.parse(await ev('JSON.stringify(window.__audit.recs)'));
  const hasCard = recs.some(t => t.indexOf('到达终点') >= 0);
  A.chk('最后一帧画出了结算卡「到达终点！」', hasCard,
    hasCard ? '' : '最后一帧文字：' + recs.slice(0, 8).join(' | '));
  const replayStill = recs.some(t => t.indexOf('回放') === 0);
  A.chk('而且是结算卡、不是回放（win 不该有回放）', !replayStill,
    replayStill ? '画面还在放回放' : '');

  // ---------- 3. 真实跑完一局仍然能结算 ----------
  await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null; s.resultT=0; return 1;})()`);
  await sleep(200);
  await ev(`(()=>{const s=window.__rap.state, R=window.__rap.RAP;
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(window.__rap.levels[0], s.build, R.SPECS['1-1']);
    window.__rap.launch(); return 1;})()`);
  let natural = null;
  for (let i = 0; i < 60; i++) {
    await sleep(200);
    natural = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
      return JSON.stringify({phase:s.phase, result:s.run?s.run.result:null,
        reason:s.run?(s.run.failReason||''):'', t:s.run?s.run.time:0});})()`));
    if (natural.result) break;
  }
  A.chk('真跑一局能自然结束（不是靠外部改状态）', !!natural.result,
    JSON.stringify(natural));
  A.chk('1-1 标准解应 win 且不是 no_progress',
    natural.result === 'win', natural.result + ' / ' + (natural.reason || '-'));
  await sleep(700);
  const recs2 = JSON.parse(await ev('JSON.stringify(window.__audit.recs)'));
  A.chk('自然通过后也画出了结算卡', recs2.some(t => t.indexOf('到达终点') >= 0),
    recs2.slice(0, 8).join(' | '));

  A.chk('无 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

/* 失败回放：失败后必须真的放一段"车怎么出事的"回放，而不是直接弹结算。
 *
 * 判据（原来只截两张图 + 打印 failReason，exit 0）：
 *   1. 失败结算时 run.replay 里确实有轨迹帧；
 *   2. 回放时间里 state.replayT 在推进；
 *   3. 回放结束后自动进入结算（不会卡在回放态）。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9362;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeR-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }

  // 1-5：只有一块木框 + 一个轮子 + 猪的"脆弱车"，跑起来必然出事
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[4];
    window.__rap.startLevel(4); s.welcome=0; s.introT=1;
    s.build.cells = {}; s.build.cells['4,1'] = { part: 'wood_frame', dir: 0, hp: 3 };
    s.build.cells['5,1'] = { part: 'wood_wheel', dir: 0, hp: 1 };
    s.build.cells['4,1'].inner = 'pig';
    s.build.order = ['4,1', '5,1', 'inner:4,1'];
    window.__rap.launch();
  })()`);
  A.chk('脆车也能发射', (await ev('window.__rap.state.phase')) === 'run',
    'phase=' + (await ev('window.__rap.state.phase')));

  let resolved = false, result = '';
  for (let i = 0; i < 220; i++) {
    await sleep(200);
    if ((await ev('window.__rap.state.phase')) === 'resolved') { resolved = true; break; }
  }
  result = await ev('(window.__rap.state.run||{}).result || ""');
  A.chk('脆弱车这一局确实失败（不是偷偷赢了）', resolved && result === 'fail',
    'resolved=' + resolved + ' result=' + result);

  const failReason = await ev('(window.__rap.state.run||{}).failReason || ""');
  A.chk('失败有明确原因', !!failReason, 'failReason=' + failReason);

  const frames = await ev('((window.__rap.state.run||{}).replay||[]).length');
  A.chk('回放里存下了轨迹帧', frames > 5, frames + ' 帧');

  // 回放进度必须真的在走（state.replayT 由帧循环推进）
  const rt1 = await ev('window.__rap.state.replayT || 0');
  await sleep(500);
  const rt2 = await ev('window.__rap.state.replayT || 0');
  A.chk('回放进度在推进（没有卡在第 0 秒）', rt2 > rt1, rt1.toFixed(2) + ' → ' + rt2.toFixed(2));
  await shot('rp-01-replay-a');
  await sleep(900);
  await shot('rp-02-replay-b');

  // 回放结束后仍然停在结算（不会卡在回放态 / 也不会自己跳回建造）
  await sleep(2600);
  A.chk('回放结束仍停在结算页（不会自己跳走）',
    (await ev('window.__rap.state.phase')) === 'resolved',
    'phase=' + (await ev('window.__rap.state.phase')));

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

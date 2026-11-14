/* 探针：结算卡上那个 "+80" 到底加到了哪里？
 *
 * 金币总数不是累加的，而是**由永久标记推导**出来的（coinsOf ← stars + boxes）。
 * 那么同一关打第二遍，卡上如果还写 "+80"，而总数一点没动，
 * 屏幕上的数字就是假的 —— 玩家会以为自己在攒钱。
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
  C.fillText = function (txt) { window.__audit.recs.push(String(txt)); return oText.apply(this, arguments); };
  return 'patched';
})()`;

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeCN-' + Date.now()),
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
  await send('Runtime.evaluate', { expression:
    "localStorage.setItem('rap-welcomed-v1','1');localStorage.removeItem('rap-progress-v1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  await ev(PATCH);
  await ev('window.__rap.state.introT=1');
  await sleep(250);

  async function playOne(idx, spec) {
    const before = await ev('window.__rap.totalCoins()');
    await ev(`window.__rap.launchSpec(${idx}, '${spec}')`);
    for (let i = 0; i < 150; i++) {
      await sleep(200);
      if (await ev('window.__rap.state.run && window.__rap.state.run.result')) break;
    }
    await sleep(3400);
    const after = await ev('window.__rap.totalCoins()');
    const recs = JSON.parse(await ev('JSON.stringify(window.__audit.recs)'));
    const plus = recs.filter(t => /^\+/.test(t));
    const stars = recs.filter(t => /^★/.test(t) || /星/.test(t));
    console.log(`  [${spec}] 总数 ${before} → ${after}（实增 ${after - before}）；卡上写：${plus.join(' ') || '(无)'}`);
    return { before, after, shown: plus };
  }

  console.log('第一遍（空存档）：');
  const a = await playOne(0, '1-1');
  console.log('第二遍（同一关再打一次）：');
  const b = await playOne(0, '1-1');
  console.log('第三遍（再来一次）：');
  const c = await playOne(0, '1-1');

  const shownNum = t => { const m = /^\+(\d+)$/.exec(t || ''); return m ? +m[1] : null; };
  const honestOf = x => {
    const g = x.after - x.before, s = shownNum(x.shown[0]);
    if (g === 0) return s === null;          // 没进钱就不许写 +N（写「已拿满」是对的）
    return s === g;                          // 进了多少就写多少
  };
  console.log('\n判定：');
  [a, b, c].forEach((x, i) => {
    console.log('  第' + ['一', '二', '三'][i] + '遍 实增 ' + (x.after - x.before) +
      ' / 卡上 ' + (x.shown[0] || '(不是 +N)') + '  → ' + (honestOf(x) ? '诚实' : '**假**'));
  });
  const honest = [a, b, c].every(honestOf);
  console.log(honest ? '  → 诚实：卡上的数字就是钱包的变化'
    : '  → **卡上的数字是假的**（说了加钱，钱没加 / 加了钱没说）');
  console.log('\nerrors:', errs.length ? errs.slice(0, 3) : '(none)');
  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

/* 探针：1-6 是全片唯一"必须点车身"的关卡。
 *
 * 玩家在行驶中如果不知道"可以点车上的沙袋/气球"，1-6 就是**不可通关**的 ——
 * 不是难，是没有入口。所以要量：跑起来的那 12 秒里，屏幕上到底有没有
 * 一个字告诉玩家该点哪儿。
 *
 * 输出刻意压到很小：每个不同的文字只报一次（带首次出现时间），
 * 否则一帧五条 × 12 秒 = 上千行，人眼根本读不出来。
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
  const oText = C.fillText;
  window.__audit = { seen: {}, order: [] };
  C.fillText = function (txt) {
    const t = String(txt);
    const st = window.__rap && window.__rap.state;
    const ph = st ? st.phase : '';
    if (ph !== 'run') return oText.apply(this, arguments);
    if (!window.__audit.seen[t]) {
      window.__audit.seen[t] = {
        time: st && st.run ? +(st.run.time || 0).toFixed(2) : 0,
        n: 0
      };
      window.__audit.order.push(t);
    }
    window.__audit.seen[t].n++;
    return oText.apply(this, arguments);
  };
  return 'patched';
})()`;

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edge16h-' + Date.now()),
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

  // 只造车、不自动送件 —— 模拟"一个不知道该点车身的玩家"
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[5];
    window.__rap.startLevel(5); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-6']);
    window.__rap.launch(); return 1;})()`);

  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if ((await ev('window.__rap.state.phase')) === 'resolved') break;
  }
  const res = await ev('window.__rap.state.run ? window.__rap.state.run.result : "?"');
  const order = JSON.parse(await ev('JSON.stringify(window.__audit.order)'));
  const seen = JSON.parse(await ev('JSON.stringify(window.__audit.seen)'));

  console.log('结果：' + res + '（一个不知道要点车身的玩家会得到这个结果）');
  console.log('\n行驶期屏幕上一共出现 ' + order.length + ' 种不同的文字：');
  const norm = t => t.replace(/[\d.]+/g, '#');
  const families = {};
  order.forEach(t => {
    const k = norm(t);
    if (!families[k]) families[k] = { ex: t, time: seen[t].time, n: 0 };
    families[k].n += seen[t].n;
  });
  Object.values(families).forEach(f => {
    console.log('  ' + String(f.time).padStart(5) + 's  ×' + String(f.n).padStart(5) + '  ' + f.ex);
  });

  const mentions = t => /点|沙袋|气球|扔|扎|交互/.test(t);
  const hits = order.filter(mentions);
  console.log('\n其中提到"点/沙袋/气球/扔/扎/交互"的：');
  if (hits.length) hits.forEach(t => console.log('  ' + seen[t].time + 's「' + t + '」'));
  else console.log('  **一条都没有** —— 玩家无法从画面上得知要点车身');

  console.log('\nerrors:', errs.length ? errs.slice(0, 3) : '(none)');
  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
